import { FixedClock } from '@shared/kernel';
import { ReportingQueriesPort } from '../application/ports/reporting-queries.port';
import { ReportingPeriod } from '../application/reporting-period';
import {
  CommissionsDashboard,
  DashboardSummary,
  MissionsDashboard,
  PaymentsDashboard,
  QuotesDashboard,
  UsersDashboard,
} from '../application/read-models/dashboard.read-models';

export const NOW = new Date('2026-11-15T10:00:00.000Z');

/** Canned aggregates with sparse monthly series; records the periods it was asked for. */
export class FakeReportingQueries extends ReportingQueriesPort {
  readonly periods: ReportingPeriod[] = [];
  readonly nows: Date[] = [];

  summary(): Promise<Omit<DashboardSummary, 'generatedAt'>> {
    return Promise.resolve({
      quotes: { total: 1, byStatus: { EN_ATTENTE: 1 } },
      missions: { total: 0, active: 0, completed: 0, byStatus: {} },
      payments: { validated: { count: 0, amount: 0 }, pending: { count: 0, amount: 0 } },
      commissions: { byStatus: {} },
      users: { total: 2, byRole: { client: 1, admin: 1 } },
      reviews: { count: 0, averageRating: null },
    });
  }
  quotes(period: ReportingPeriod): Promise<Omit<QuotesDashboard, 'period'>> {
    this.periods.push(period);
    return Promise.resolve({
      byStatus: {},
      byType: {},
      monthly: [{ month: period.months.at(-1)!, created: 2, validated: 1 }],
    });
  }
  missions(period: ReportingPeriod, now: Date): Promise<Omit<MissionsDashboard, 'period'>> {
    this.periods.push(period);
    this.nows.push(now);
    return Promise.resolve({
      byStatus: {},
      active: 0,
      completed: 0,
      overdue: 0,
      averageProgress: null,
      monthly: [{ month: period.months[0], created: 4 }],
    });
  }
  payments(period: ReportingPeriod): Promise<Omit<PaymentsDashboard, 'period'>> {
    this.periods.push(period);
    const zero = { count: 0, amount: 0 };
    return Promise.resolve({
      validated: zero,
      pending: zero,
      invoiced: zero,
      consultantInvoices: { paid: zero, unpaid: zero },
      monthly: [{ month: period.months[0], validated: { count: 1, amount: 10 }, pending: zero }],
    });
  }
  commissions(): Promise<CommissionsDashboard> {
    return Promise.resolve({ byStatus: {}, withoutAmount: 0, byApporteur: [] });
  }
  users(period: ReportingPeriod): Promise<Omit<UsersDashboard, 'period'>> {
    this.periods.push(period);
    return Promise.resolve({
      total: 0,
      active: 0,
      inactive: 0,
      byRole: {},
      consultants: { validated: 0, pending: 0 },
      monthly: [],
    });
  }
}

export const reportingTestContext = () => ({
  reporting: new FakeReportingQueries(),
  clock: new FixedClock(NOW),
});
