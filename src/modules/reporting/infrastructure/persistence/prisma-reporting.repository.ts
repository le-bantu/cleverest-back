import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import {
  CommissionsDashboard,
  CountAndAmount,
  DashboardSummary,
  MissionsDashboard,
  PaymentsDashboard,
  QuotesDashboard,
  ReportingPeriod,
  ReportingQueriesPort,
  UsersDashboard,
} from '../../application';

/*
 * Plain SQL aggregations over the other contexts' tables. Enum columns are read with
 * `::text`, i.e. the stored labels (`SIGNÉ_CLIENT`, `TERMINÉE` …) which are the values the
 * API exposes everywhere else. Months are UTC (`date_trunc` on timestamp without time zone).
 */

type CountRow = { key: string; count: bigint };
type CountAmountRow = { key: string; count: bigint; amount: string | null };

const num = (v: bigint | number | string | null | undefined): number => Number(v ?? 0);
const cents = (v: string | number | null | undefined): number =>
  Math.round(Number(v ?? 0) * 100) / 100;
const ca = (count: bigint | number, amount: string | null): CountAndAmount => ({
  count: num(count),
  amount: cents(amount),
});
const counts = (rows: CountRow[]): Record<string, number> =>
  Object.fromEntries(rows.map((r) => [r.key, num(r.count)]));
const countsAndAmounts = (rows: CountAmountRow[]): Record<string, CountAndAmount> =>
  Object.fromEntries(rows.map((r) => [r.key, ca(r.count, r.amount)]));

const MONTH = Prisma.sql`'YYYY-MM'`;
const OPEN_MISSION = Prisma.sql`status::text NOT IN ('TERMINÉE', 'REJETÉE')`;
const ACTIVE_MISSION = Prisma.sql`status::text IN ('EN_COURS', 'EN_VALIDATION')`;
/** subquotes are the consultants' internal pricing of a client request: not counted */
const MAIN_QUOTE = Prisma.sql`"parentQuoteId" IS NULL`;

@Injectable()
export class PrismaReportingRepository extends ReportingQueriesPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async summary(): Promise<Omit<DashboardSummary, 'generatedAt'>> {
    const [quotes, missions, payments, commissions, users, roles, reviews] = await Promise.all([
      this.quoteStatuses(),
      this.missionStatuses(),
      this.paymentTotals(),
      this.commissionStatuses(),
      this.userTotals(),
      this.roleCounts(),
      this.prisma.$queryRaw<Array<{ count: bigint; avg: string | null }>>`
        SELECT COUNT(*) AS count, ROUND(AVG(rating)::numeric, 2)::text AS avg FROM mission_reviews`,
    ]);
    return {
      quotes: { total: sum(quotes), byStatus: quotes },
      missions: {
        total: sum(missions),
        active: (missions['EN_COURS'] ?? 0) + (missions['EN_VALIDATION'] ?? 0),
        completed: missions['TERMINÉE'] ?? 0,
        byStatus: missions,
      },
      payments,
      commissions: { byStatus: commissions },
      users: { total: users.total, byRole: roles },
      reviews: {
        count: num(reviews[0].count),
        averageRating: reviews[0].avg === null ? null : Number(reviews[0].avg),
      },
    };
  }

  async quotes(period: ReportingPeriod): Promise<Omit<QuotesDashboard, 'period'>> {
    const [byStatus, byType, monthly] = await Promise.all([
      this.quoteStatuses(),
      this.prisma.$queryRaw<CountRow[]>`
        SELECT type::text AS key, COUNT(*) AS count FROM quotes WHERE ${MAIN_QUOTE} GROUP BY 1`,
      this.prisma.$queryRaw<Array<{ month: string; created: bigint; validated: bigint }>>`
        WITH events AS (
          SELECT "createdAt" AS at, 1 AS created, 0 AS validated FROM quotes WHERE ${MAIN_QUOTE}
          UNION ALL
          SELECT "validatedAt", 0, 1 FROM quotes WHERE ${MAIN_QUOTE} AND "validatedAt" IS NOT NULL
        )
        SELECT to_char(date_trunc('month', at), ${MONTH}) AS month,
               SUM(created)::bigint AS created, SUM(validated)::bigint AS validated
        FROM events WHERE at >= ${period.from} AND at < ${period.to}
        GROUP BY 1 ORDER BY 1`,
    ]);
    return {
      byStatus,
      byType: counts(byType),
      monthly: monthly.map((m) => ({
        month: m.month,
        created: num(m.created),
        validated: num(m.validated),
      })),
    };
  }

  async missions(period: ReportingPeriod, now: Date): Promise<Omit<MissionsDashboard, 'period'>> {
    const [byStatus, stats, monthly] = await Promise.all([
      this.missionStatuses(),
      this.prisma.$queryRaw<Array<{ overdue: bigint; progress: string | null }>>`
        SELECT
          COUNT(*) FILTER (WHERE ${OPEN_MISSION} AND "deliveryDate" < ${now}) AS overdue,
          ROUND(AVG(progress) FILTER (WHERE ${ACTIVE_MISSION})::numeric, 1)::text AS progress
        FROM missions`,
      this.monthlyCreated('missions', period),
    ]);
    return {
      byStatus,
      active: (byStatus['EN_COURS'] ?? 0) + (byStatus['EN_VALIDATION'] ?? 0),
      completed: byStatus['TERMINÉE'] ?? 0,
      overdue: num(stats[0].overdue),
      averageProgress: stats[0].progress === null ? null : Number(stats[0].progress),
      monthly,
    };
  }

  async payments(period: ReportingPeriod): Promise<Omit<PaymentsDashboard, 'period'>> {
    const [totals, invoiced, consultant, monthly] = await Promise.all([
      this.paymentTotals(),
      this.prisma.$queryRaw<Array<{ count: bigint; amount: string | null }>>`
        SELECT COUNT(*) AS count, SUM(amount)::text AS amount FROM client_invoices`,
      this.prisma.$queryRaw<CountAmountRow[]>`
        SELECT CASE WHEN "paidAt" IS NULL THEN 'unpaid' ELSE 'paid' END AS key,
               COUNT(*) AS count, SUM(amount)::text AS amount
        FROM consultant_invoices GROUP BY 1`,
      this.prisma.$queryRaw<
        Array<{
          month: string;
          validated_count: bigint;
          validated_amount: string | null;
          pending_count: bigint;
          pending_amount: string | null;
        }>
      >`
        WITH events AS (
          SELECT "validatedAt" AS at, true AS validated, amount FROM payments
          WHERE "validatedAt" IS NOT NULL
          UNION ALL
          SELECT "createdAt", false, amount FROM payments WHERE "validatedAt" IS NULL
        )
        SELECT to_char(date_trunc('month', at), ${MONTH}) AS month,
               COUNT(*) FILTER (WHERE validated) AS validated_count,
               SUM(amount) FILTER (WHERE validated)::text AS validated_amount,
               COUNT(*) FILTER (WHERE NOT validated) AS pending_count,
               SUM(amount) FILTER (WHERE NOT validated)::text AS pending_amount
        FROM events WHERE at >= ${period.from} AND at < ${period.to}
        GROUP BY 1 ORDER BY 1`,
    ]);
    const byPaid = countsAndAmounts(consultant);
    return {
      ...totals,
      invoiced: ca(invoiced[0].count, invoiced[0].amount),
      consultantInvoices: {
        paid: byPaid['paid'] ?? { count: 0, amount: 0 },
        unpaid: byPaid['unpaid'] ?? { count: 0, amount: 0 },
      },
      monthly: monthly.map((m) => ({
        month: m.month,
        validated: ca(m.validated_count, m.validated_amount),
        pending: ca(m.pending_count, m.pending_amount),
      })),
    };
  }

  async commissions(): Promise<CommissionsDashboard> {
    const [byStatus, unset, perApporteur] = await Promise.all([
      this.commissionStatuses(),
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count FROM commissions WHERE amount IS NULL`,
      this.prisma.$queryRaw<
        Array<{
          apporteur_id: string;
          name: string | null;
          email: string | null;
          key: string;
          count: bigint;
          amount: string | null;
        }>
      >`
        SELECT c."apporteurId" AS apporteur_id, p.structure AS name, u.email,
               c.status::text AS key, COUNT(*) AS count, SUM(c.amount)::text AS amount
        FROM commissions c
        JOIN users u ON u.id = c."apporteurId"
        LEFT JOIN apporteur_profiles p ON p."userId" = c."apporteurId"
        GROUP BY 1, 2, 3, 4`,
    ]);
    const apporteurs = new Map<string, CommissionsDashboard['byApporteur'][number]>();
    for (const row of perApporteur) {
      const a = apporteurs.get(row.apporteur_id) ?? {
        apporteurId: row.apporteur_id,
        name: row.name,
        email: row.email,
        count: 0,
        amount: 0,
        byStatus: {},
      };
      const entry = ca(row.count, row.amount);
      a.byStatus[row.key] = entry;
      a.count += entry.count;
      a.amount = cents(a.amount + entry.amount);
      apporteurs.set(row.apporteur_id, a);
    }
    return {
      byStatus,
      withoutAmount: num(unset[0].count),
      byApporteur: [...apporteurs.values()].sort(
        (x, y) =>
          y.amount - x.amount || y.count - x.count || x.apporteurId.localeCompare(y.apporteurId),
      ),
    };
  }

  async users(period: ReportingPeriod): Promise<Omit<UsersDashboard, 'period'>> {
    const [totals, byRole, consultants, monthly] = await Promise.all([
      this.userTotals(),
      this.roleCounts(),
      this.prisma.$queryRaw<Array<{ validated: bigint; pending: bigint }>>`
        SELECT COUNT(*) FILTER (WHERE cp.validated) AS validated,
               COUNT(*) FILTER (WHERE NOT cp.validated) AS pending
        FROM consultant_profiles cp JOIN users u ON u.id = cp."userId"
        WHERE u."deletedAt" IS NULL`,
      this.monthlyCreated('users', period, Prisma.sql`"deletedAt" IS NULL`),
    ]);
    return {
      ...totals,
      byRole,
      consultants: {
        validated: num(consultants[0].validated),
        pending: num(consultants[0].pending),
      },
      monthly,
    };
  }

  // ---------------------------------------------------------------------------

  private async quoteStatuses(): Promise<Record<string, number>> {
    return counts(
      await this.prisma.$queryRaw<CountRow[]>`
        SELECT status::text AS key, COUNT(*) AS count FROM quotes WHERE ${MAIN_QUOTE} GROUP BY 1`,
    );
  }

  private async missionStatuses(): Promise<Record<string, number>> {
    return counts(
      await this.prisma.$queryRaw<CountRow[]>`
        SELECT status::text AS key, COUNT(*) AS count FROM missions GROUP BY 1`,
    );
  }

  private async commissionStatuses(): Promise<Record<string, CountAndAmount>> {
    return countsAndAmounts(
      await this.prisma.$queryRaw<CountAmountRow[]>`
        SELECT status::text AS key, COUNT(*) AS count, SUM(amount)::text AS amount
        FROM commissions GROUP BY 1`,
    );
  }

  private async paymentTotals(): Promise<{ validated: CountAndAmount; pending: CountAndAmount }> {
    const rows = countsAndAmounts(
      await this.prisma.$queryRaw<CountAmountRow[]>`
        SELECT CASE WHEN "validatedAt" IS NULL THEN 'pending' ELSE 'validated' END AS key,
               COUNT(*) AS count, SUM(amount)::text AS amount
        FROM payments GROUP BY 1`,
    );
    return {
      validated: rows['validated'] ?? { count: 0, amount: 0 },
      pending: rows['pending'] ?? { count: 0, amount: 0 },
    };
  }

  /** soft-deleted accounts are left out of every user figure */
  private async userTotals(): Promise<{ total: number; active: number; inactive: number }> {
    const [row] = await this.prisma.$queryRaw<
      Array<{ total: bigint; active: bigint; inactive: bigint }>
    >`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE "isActive") AS active,
             COUNT(*) FILTER (WHERE NOT "isActive") AS inactive
      FROM users WHERE "deletedAt" IS NULL`;
    return { total: num(row.total), active: num(row.active), inactive: num(row.inactive) };
  }

  private async roleCounts(): Promise<Record<string, number>> {
    return counts(
      await this.prisma.$queryRaw<CountRow[]>`
        SELECT r.name AS key, COUNT(*) AS count
        FROM user_roles ur
        JOIN roles r ON r.id = ur."roleId"
        JOIN users u ON u.id = ur."userId"
        WHERE u."deletedAt" IS NULL
        GROUP BY 1`,
    );
  }

  private async monthlyCreated(
    table: 'missions' | 'users',
    period: ReportingPeriod,
    extra: Prisma.Sql = Prisma.sql`TRUE`,
  ): Promise<Array<{ month: string; created: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ month: string; created: bigint }>>`
      SELECT to_char(date_trunc('month', "createdAt"), ${MONTH}) AS month, COUNT(*) AS created
      FROM ${Prisma.raw(`"${table}"`)}
      WHERE "createdAt" >= ${period.from} AND "createdAt" < ${period.to} AND ${extra}
      GROUP BY 1 ORDER BY 1`;
    return rows.map((r) => ({ month: r.month, created: num(r.created) }));
  }
}

const sum = (byKey: Record<string, number>): number =>
  Object.values(byKey).reduce((total, n) => total + n, 0);
