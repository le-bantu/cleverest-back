import { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import { PrismaConsultantInvoiceRepository } from '../../src/modules/consultant-invoices/infrastructure/persistence/prisma-consultant-invoice.repository';
import { ConsultantInvoice } from '../../src/modules/consultant-invoices/domain';
import { getTestPrisma } from '../utils/test-db';
import { seedRbac } from '../fixtures/seed-rbac';
import { createUser, SeededUser } from '../fixtures/quotes';
import { insertMission } from '../fixtures/missions';

const NOW = new Date('2026-08-01T10:00:00.000Z');
const LATER = new Date('2026-08-02T10:00:00.000Z');

describe('PrismaConsultantInvoiceRepository (integration)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaConsultantInvoiceRepository(prisma);
  let c1: SeededUser;
  let c2: SeededUser;
  let admin: SeededUser;
  let m1: { id: string; quoteId: string };
  let m2: { id: string; quoteId: string };

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    const db = getTestPrisma();
    await seedRbac(db);
    const client = await createUser(db, 'client@int.test', 'client');
    c1 = await createUser(db, 'c1@int.test', 'consultant');
    c2 = await createUser(db, 'c2@int.test', 'consultant');
    admin = await createUser(db, 'admin@int.test', 'admin');
    m1 = await insertMission(db, client.id, [c1.id, c2.id]);
    m2 = await insertMission(db, client.id, [c1.id]);
  });

  const submit = (
    mission: { id: string; quoteId: string },
    consultantId: string,
    amount: number,
    at = NOW,
  ) =>
    ConsultantInvoice.submit(
      {
        id: repo.nextIdentity(),
        mission: { ...mission, consultantIds: [consultantId] },
        consultantId,
        amount,
        commitment: { signedAmount: 1_000_000, alreadyInvoiced: 0 },
        file: { key: `ci/${amount}`, originalName: 'f.pdf', mimeType: 'application/pdf', size: 4 },
      },
      at,
    );

  it('round-trips, sums per (consultant, main quote) and marks paid', async () => {
    const a = submit(m1, c1.id, 100.1);
    const b = submit(m1, c1.id, 200.2);
    const c = submit(m2, c1.id, 50);
    for (const i of [a, b, c]) await repo.save(i);
    expect(await repo.totalInvoiced(c1.id, m1.quoteId)).toBe(300.3);
    expect(await repo.totalInvoiced(c2.id, m1.quoteId)).toBe(0);

    a.markPaid(admin.id, LATER);
    await repo.save(a);
    expect(await repo.findById(a.id)).toMatchObject({
      quoteId: m1.quoteId,
      amount: 100.1,
      isPaid: true,
      paidAt: LATER,
      paidById: admin.id,
    });
    expect(await repo.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('list filters and sorts', async () => {
    const a = submit(m1, c1.id, 100, new Date('2026-01-05T00:00:00Z'));
    const b = submit(m1, c2.id, 300);
    const c = submit(m2, c1.id, 200);
    c.markPaid(admin.id, NOW);
    for (const i of [a, b, c]) await repo.save(i);
    const ids = async (f: Parameters<typeof repo.list>[1], sort?: string) =>
      (await repo.list({ page: 1, perPage: 10, sort }, f)).data.map((i) => i.id);
    expect(await ids({})).toHaveLength(3);
    expect((await ids({ consultantId: c1.id })).sort()).toEqual([a.id, c.id].sort());
    expect((await ids({ missionId: m1.id })).sort()).toEqual([a.id, b.id].sort());
    expect(await ids({ isPaid: true })).toEqual([c.id]);
    expect((await ids({ isPaid: false })).sort()).toEqual([a.id, b.id].sort());
    expect(await ids({ uploadedTo: new Date('2026-02-01') })).toEqual([a.id]);
    expect((await ids({ uploadedFrom: new Date('2026-02-01') })).sort()).toEqual(
      [b.id, c.id].sort(),
    );
    expect(await ids({}, 'amount:desc')).toEqual([b.id, c.id, a.id]);
    expect(await ids({}, 'hack:asc')).toHaveLength(3);
  });

  it('the database refuses a non-positive amount and a half-paid invoice', async () => {
    const db = getTestPrisma();
    const base = {
      consultantId: c1.id,
      missionId: m1.id,
      quoteId: m1.quoteId,
      fileKey: 'k',
      fileName: 'f.pdf',
      size: 1,
      uploadedAt: NOW,
    };
    await expect(db.consultantInvoice.create({ data: { ...base, amount: 0 } })).rejects.toThrow();
    await expect(
      db.consultantInvoice.create({ data: { ...base, amount: 5, paidAt: NOW } }),
    ).rejects.toThrow();
  });
});
