import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import { PrismaReportingRepository } from '../../src/modules/reporting/infrastructure/persistence/prisma-reporting.repository';
import { reportingPeriod } from '../../src/modules/reporting/application/reporting-period';
import { getTestPrisma } from '../utils/test-db';
import { seedRbac } from '../fixtures/seed-rbac';
import { createUser, SeededUser } from '../fixtures/quotes';
import { insertMission } from '../fixtures/missions';

const NOW = new Date('2026-11-15T10:00:00.000Z');
const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
const PERIOD = reportingPeriod(NOW, d('2026-01-01'), d('2026-06-30'));

/**
 * A known dataset (see the expectations): 3 missions, 5 main quotes + 1 subquote,
 * 4 payments, 2 consultant invoices, 3 commissions from 2 apporteurs, 2 reviews,
 * 7 live users (+1 soft-deleted).
 */
const seedDataset = async (db: PrismaClient) => {
  await seedRbac(db);
  const admin = await createUser(db, 'admin@int.test', 'admin');
  const client = await createUser(db, 'c1@int.test', 'client');
  await createUser(db, 'c2@int.test', 'client', undefined, { isActive: false });
  await createUser(db, 'c3@int.test', 'client', undefined, { deletedAt: d('2026-02-01') });
  const k1 = await createUser(db, 'k1@int.test', 'consultant', { validated: true });
  await createUser(db, 'k2@int.test', 'consultant', { validated: false });
  const p1 = await createUser(db, 'p1@int.test', 'apporteur');
  const p2 = await createUser(db, 'p2@int.test', 'apporteur');
  await db.apporteurProfile.create({ data: { userId: p1.id, structure: 'Apport SA' } });

  const mission = async (
    status: 'EN_COURS' | 'EN_VALIDATION' | 'TERMINEE',
    progress: number,
    deliveryDate: string,
    createdAt: string,
    validatedAt: string | null,
  ) => {
    const m = await insertMission(db, client.id, [k1.id], `M ${status}`);
    await db.mission.update({
      where: { id: m.id },
      data: { status, progress, deliveryDate: d(deliveryDate), createdAt: d(createdAt) },
    });
    await db.quote.update({
      where: { id: m.quoteId },
      data: { createdAt: d(createdAt), validatedAt: validatedAt ? d(validatedAt) : null },
    });
    return m;
  };
  const m1 = await mission('EN_COURS', 40, '2026-10-01', '2026-03-10', '2026-04-02'); // overdue
  const m2 = await mission('EN_VALIDATION', 80, '2027-01-01', '2026-03-20', '2026-03-25');
  const m3 = await mission('TERMINEE', 100, '2026-01-01', '2025-06-01', null); // closed: not overdue

  const quote = (
    n: number,
    status: 'EN_ATTENTE' | 'REJETE',
    type: 'CONSULTATION' | 'ABONNEMENT',
    at: string,
    parentQuoteId?: string,
  ) =>
    db.quote.create({
      data: {
        clientId: client.id,
        requestNumber: `rep-${n}`,
        type,
        description: 'x',
        status,
        createdAt: d(at),
        parentQuoteId,
        isSubquote: !!parentQuoteId,
      },
    });
  const pending = await quote(1, 'EN_ATTENTE', 'CONSULTATION', '2026-05-05');
  await quote(2, 'REJETE', 'ABONNEMENT', '2026-05-06');
  await quote(3, 'EN_ATTENTE', 'CONSULTATION', '2026-05-07', pending.id); // subquote: ignored

  const payment = (amount: string, createdAt: string, validatedAt: string | null) =>
    db.payment.create({
      data: {
        missionId: m1.id,
        clientId: client.id,
        amount,
        proofFileKey: 'p',
        proofFileName: 'p.pdf',
        proofSize: 1,
        createdAt: d(createdAt),
        validatedAt: validatedAt ? d(validatedAt) : null,
        validatedById: validatedAt ? admin.id : null,
      },
    });
  const paid = await payment('1000.50', '2026-04-01', '2026-04-10');
  await payment('250.00', '2026-04-20', '2026-05-02');
  await payment('99.99', '2026-05-15', null);
  await payment('10.00', '2025-01-01', null); // outside the period, still pending
  await db.clientInvoice.create({
    data: {
      paymentId: paid.id,
      missionId: m1.id,
      clientId: client.id,
      invoiceNumber: 'FAC-2026-0001',
      amount: '1000.50',
      pdfFileKey: 'i',
      pdfFileName: 'i.pdf',
      pdfSize: 1,
      generatedAt: d('2026-04-10'),
    },
  });
  for (const [amount, paidAt] of [
    ['300.00', d('2026-06-01')],
    ['200.00', null],
  ] as const) {
    await db.consultantInvoice.create({
      data: {
        consultantId: k1.id,
        missionId: m1.id,
        quoteId: m1.quoteId,
        amount,
        fileKey: 'f',
        fileName: 'f.pdf',
        size: 1,
        uploadedAt: d('2026-05-20'),
        paidAt,
        paidById: paidAt ? admin.id : null,
      },
    });
  }

  const commission = async (
    apporteur: SeededUser,
    m: { id: string },
    status: 'EN_ATTENTE' | 'VALIDEE' | 'PAYEE',
    amount: string | null,
  ) => {
    const prospect = await db.prospect.create({
      data: {
        apporteurId: apporteur.id,
        name: 'Lead',
        status: 'CONVERTI',
        clientId: client.id,
        missionId: m.id,
      },
    });
    await db.commission.create({
      data: {
        apporteurId: apporteur.id,
        prospectId: prospect.id,
        clientId: client.id,
        missionId: m.id,
        clientName: 'ACME',
        missionTitle: 'M',
        amount,
        status,
        validatedAt: status === 'EN_ATTENTE' ? null : d('2026-06-01'),
        paidAt: status === 'PAYEE' ? d('2026-06-15') : null,
      },
    });
  };
  await commission(p1, m1, 'EN_ATTENTE', null);
  await commission(p1, m2, 'VALIDEE', '500.00');
  await commission(p2, m3, 'PAYEE', '200.00');

  for (const [m, rating] of [
    [m3, 4],
    [m2, 5],
  ] as const) {
    await db.missionReview.create({
      data: { missionId: m.id, clientId: client.id, rating, updatedAt: NOW },
    });
  }
  return { p1, p2 };
};

describe('PrismaReportingRepository (integration)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaReportingRepository(prisma);
  let seeded: Awaited<ReturnType<typeof seedDataset>>;

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    seeded = await seedDataset(getTestPrisma());
  });

  it('summary', async () => {
    expect(await repo.summary()).toEqual({
      quotes: { total: 5, byStatus: { SIGNÉ_CLIENT: 3, EN_ATTENTE: 1, REJETÉ: 1 } },
      missions: {
        total: 3,
        active: 2,
        completed: 1,
        byStatus: { EN_COURS: 1, EN_VALIDATION: 1, TERMINÉE: 1 },
      },
      payments: {
        validated: { count: 2, amount: 1250.5 },
        pending: { count: 2, amount: 109.99 },
      },
      commissions: {
        byStatus: {
          EN_ATTENTE: { count: 1, amount: 0 },
          VALIDÉE: { count: 1, amount: 500 },
          PAYÉE: { count: 1, amount: 200 },
        },
      },
      users: { total: 7, byRole: { admin: 1, client: 2, consultant: 2, apporteur: 2 } },
      reviews: { count: 2, averageRating: 4.5 },
    });
  });

  it('quotes: statuses, types and a sparse monthly series (subquotes left out)', async () => {
    expect(await repo.quotes(PERIOD)).toEqual({
      byStatus: { SIGNÉ_CLIENT: 3, EN_ATTENTE: 1, REJETÉ: 1 },
      byType: { CONSULTATION: 4, ABONNEMENT: 1 },
      monthly: [
        { month: '2026-03', created: 2, validated: 1 },
        { month: '2026-04', created: 0, validated: 1 },
        { month: '2026-05', created: 2, validated: 0 },
      ],
    });
  });

  it('missions: active / completed / overdue / average progress', async () => {
    expect(await repo.missions(PERIOD, NOW)).toEqual({
      byStatus: { EN_COURS: 1, EN_VALIDATION: 1, TERMINÉE: 1 },
      active: 2,
      completed: 1,
      overdue: 1,
      averageProgress: 60,
      monthly: [{ month: '2026-03', created: 2 }],
    });
  });

  it('payments: validated vs pending, invoices, monthly amounts', async () => {
    expect(await repo.payments(PERIOD)).toEqual({
      validated: { count: 2, amount: 1250.5 },
      pending: { count: 2, amount: 109.99 },
      invoiced: { count: 1, amount: 1000.5 },
      consultantInvoices: { paid: { count: 1, amount: 300 }, unpaid: { count: 1, amount: 200 } },
      monthly: [
        {
          month: '2026-04',
          validated: { count: 1, amount: 1000.5 },
          pending: { count: 0, amount: 0 },
        },
        {
          month: '2026-05',
          validated: { count: 1, amount: 250 },
          pending: { count: 1, amount: 99.99 },
        },
      ],
    });
  });

  it('commissions: by status and by apporteur (largest amount first)', async () => {
    expect(await repo.commissions()).toEqual({
      byStatus: {
        EN_ATTENTE: { count: 1, amount: 0 },
        VALIDÉE: { count: 1, amount: 500 },
        PAYÉE: { count: 1, amount: 200 },
      },
      withoutAmount: 1,
      byApporteur: [
        {
          apporteurId: seeded.p1.id,
          name: 'Apport SA',
          email: 'p1@int.test',
          count: 2,
          amount: 500,
          byStatus: { EN_ATTENTE: { count: 1, amount: 0 }, VALIDÉE: { count: 1, amount: 500 } },
        },
        {
          apporteurId: seeded.p2.id,
          name: null,
          email: 'p2@int.test',
          count: 1,
          amount: 200,
          byStatus: { PAYÉE: { count: 1, amount: 200 } },
        },
      ],
    });
  });

  it('users: live accounts only, by role, consultant validation, signups per month', async () => {
    const db = getTestPrisma();
    await db.user.updateMany({ data: { createdAt: d('2026-02-10') } });
    await db.user.update({ where: { email: 'k2@int.test' }, data: { createdAt: d('2026-06-30') } });
    expect(await repo.users(PERIOD)).toEqual({
      total: 7,
      active: 6,
      inactive: 1,
      byRole: { admin: 1, client: 2, consultant: 2, apporteur: 2 },
      consultants: { validated: 1, pending: 1 },
      monthly: [
        { month: '2026-02', created: 6 }, // c3 is soft-deleted
        { month: '2026-06', created: 1 },
      ],
    });
  });

  it('an empty database gives zeros, not nulls', async () => {
    const db = getTestPrisma();
    await db.$executeRawUnsafe(
      'TRUNCATE mission_reviews, commissions, prospects, consultant_invoices, client_invoices, payments, missions, contracts, quotes CASCADE',
    );
    const summary = await repo.summary();
    expect(summary.quotes).toEqual({ total: 0, byStatus: {} });
    expect(summary.payments.validated).toEqual({ count: 0, amount: 0 });
    expect(summary.reviews).toEqual({ count: 0, averageRating: null });
    expect((await repo.missions(PERIOD, NOW)).averageProgress).toBeNull();
    expect(await repo.commissions()).toEqual({ byStatus: {}, withoutAmount: 0, byApporteur: [] });
    const payments = await repo.payments(PERIOD);
    expect(payments.invoiced).toEqual({ count: 0, amount: 0 });
    expect(payments.consultantInvoices.unpaid).toEqual({ count: 0, amount: 0 });
  });
});
