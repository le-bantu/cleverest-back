import { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import { SimplePdfGeneratorAdapter } from '../../src/shared/infrastructure/pdf/simple-pdf-generator.adapter';
import { FixedClock } from '../../src/shared/kernel';
import { BestEffortNotifier } from '../../src/shared/application/services/best-effort-notifier';
import {
  actors,
  FakeAuditLog,
  FakeEventBus,
  FakeFileStorage,
  FakeNotifier,
} from '../../src/shared/testing/fakes';
import { PrismaPaymentRepository } from '../../src/modules/payments/infrastructure/persistence/prisma-payment.repository';
import { PrismaClientInvoiceRepository } from '../../src/modules/payments/infrastructure/persistence/prisma-client-invoice.repository';
import { PrismaBillingDirectoryAdapter } from '../../src/modules/payments/infrastructure/adapters/prisma-billing-directory.adapter';
import {
  ClientInvoice,
  InvoiceNumber,
  Payment,
  PaymentMissionGatewayPort,
} from '../../src/modules/payments/domain';
import {
  GenerateClientInvoiceUseCase,
  PaymentCommitter,
} from '../../src/modules/payments/application';
import { getTestPrisma } from '../utils/test-db';
import { seedRbac } from '../fixtures/seed-rbac';
import { createUser, SeededUser } from '../fixtures/quotes';
import { insertMission } from '../fixtures/missions';

const NOW = new Date('2026-07-01T10:00:00.000Z');
const LATER = new Date('2026-07-02T10:00:00.000Z');
const proof = {
  key: 'payments/p.pdf',
  originalName: 'virement.pdf',
  mimeType: 'application/pdf',
  size: 5,
};

describe('payments persistence (integration)', () => {
  const prisma = new PrismaService();
  const payments = new PrismaPaymentRepository(prisma);
  const invoices = new PrismaClientInvoiceRepository(prisma);
  const directory = new PrismaBillingDirectoryAdapter(prisma);
  let client: SeededUser;
  let client2: SeededUser;
  let c1: SeededUser;
  let admin: SeededUser;
  let m1: { id: string; clientId: string; title: string };
  let m2: { id: string; clientId: string; title: string };

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    const db = getTestPrisma();
    await seedRbac(db);
    client = await createUser(db, 'client@int.test', 'client');
    client2 = await createUser(db, 'client2@int.test', 'client');
    c1 = await createUser(db, 'c1@int.test', 'consultant');
    admin = await createUser(db, 'admin@int.test', 'admin');
    m1 = await insertMission(db, client.id, [c1.id], 'Audit fiscal');
    m2 = await insertMission(db, client2.id);
  });

  const submit = (
    mission: { id: string; clientId: string; title: string },
    amount = 1500.25,
    at = NOW,
  ) =>
    Payment.submit(
      {
        id: payments.nextIdentity(),
        mission: { ...mission, consultantIds: [] },
        clientId: mission.clientId,
        amount,
        proofFile: proof,
      },
      at,
    );

  it('round-trips a payment (decimal amount, validation)', async () => {
    const p = submit(m1);
    await payments.save(p);
    expect(await payments.findById(p.id)).toMatchObject({
      missionId: m1.id,
      clientId: client.id,
      amount: 1500.25,
      isValidated: false,
    });
    p.validate(admin.id, LATER);
    await payments.save(p);
    expect(await payments.findById(p.id)).toMatchObject({
      isValidated: true,
      validatedAt: LATER,
      validatedById: admin.id,
    });
    expect(await payments.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('list filters (client, mission set, validation, dates) and sorts', async () => {
    const a = submit(m1, 100, new Date('2026-01-10T00:00:00Z'));
    const b = submit(m1, 300);
    const c = submit(m2, 200);
    c.validate(admin.id, NOW);
    for (const p of [a, b, c]) await payments.save(p);
    const ids = async (f: Parameters<typeof payments.list>[1], sort?: string) =>
      (await payments.list({ page: 1, perPage: 10, sort }, f)).data.map((p) => p.id);

    expect(await ids({})).toHaveLength(3);
    expect((await ids({ clientId: client.id })).sort()).toEqual([a.id, b.id].sort());
    expect(await ids({ missionIds: [m2.id] })).toEqual([c.id]);
    expect(await ids({ missionIds: [] })).toEqual([]);
    expect(await ids({ missionIds: [m1.id], missionId: m2.id })).toEqual([]);
    expect(await ids({ missionId: m2.id })).toEqual([c.id]);
    expect(await ids({ isValidated: true })).toEqual([c.id]);
    expect(await ids({ uploadedTo: new Date('2026-02-01') })).toEqual([a.id]);
    expect((await ids({ uploadedFrom: new Date('2026-02-01') })).sort()).toEqual(
      [b.id, c.id].sort(),
    );
    expect(await ids({}, 'amount:asc')).toEqual([a.id, c.id, b.id]);
    expect(await ids({}, 'hack:asc')).toHaveLength(3);
  });

  it('the database refuses a non-positive amount and a half-validated payment', async () => {
    const db = getTestPrisma();
    const base = {
      missionId: m1.id,
      clientId: client.id,
      proofFileKey: 'k',
      proofFileName: 'p.pdf',
      proofSize: 1,
    };
    await expect(db.payment.create({ data: { ...base, amount: 0 } })).rejects.toThrow();
    await expect(
      db.payment.create({ data: { ...base, amount: 5, validatedAt: NOW } }),
    ).rejects.toThrow();
  });

  it('client invoices: yearly sequence, uniqueness per payment and number, filters', async () => {
    const p1 = submit(m1);
    const p2 = submit(m2);
    for (const p of [p1, p2]) {
      p.validate(admin.id, NOW);
      await payments.save(p);
    }
    expect(await invoices.lastSequence(2026)).toBe(0);
    const make = (p: Payment, seq: number, year = 2026) =>
      ClientInvoice.generateFrom(
        {
          id: invoices.nextIdentity(),
          payment: p,
          invoiceNumber: InvoiceNumber.next(year, seq - 1),
          pdfFile: {
            key: `ci/${seq}.pdf`,
            originalName: 'f.pdf',
            mimeType: 'application/pdf',
            size: 3,
          },
          generatedById: admin.id,
          alreadyExists: false,
        },
        NOW,
      );
    const i1 = make(p1, 9);
    await invoices.save(i1);
    expect(await invoices.lastSequence(2026)).toBe(9);
    expect(await invoices.lastSequence(2025)).toBe(0);
    expect(await invoices.existsForPayment(p1.id)).toBe(true);

    await expect(invoices.save(make(p2, 9))).rejects.toMatchObject({
      code: 'INVOICE_NUMBER_TAKEN',
    });
    await expect(invoices.save(make(p1, 10))).rejects.toMatchObject({
      code: 'CLIENT_INVOICE_ALREADY_EXISTS',
    });
    const i2 = make(p2, 10000);
    await invoices.save(i2);
    expect(await invoices.lastSequence(2026)).toBe(10000); // numeric, not lexical

    i1.markSent(admin.id, LATER);
    await invoices.save(i1);
    const back = await invoices.findById(i1.id);
    expect(back).toMatchObject({ sentAt: LATER, amount: 1500.25, paymentId: p1.id });
    expect(back!.invoiceNumber.value).toBe('FAC-2026-0009');

    const ids = async (f: Parameters<typeof invoices.list>[1]) =>
      (await invoices.list({ page: 1, perPage: 10, sort: 'invoiceNumber:asc' }, f)).data.map(
        (i) => i.id,
      );
    expect(await ids({})).toEqual([i1.id, i2.id]);
    expect(await ids({ clientId: client2.id })).toEqual([i2.id]);
    expect(await ids({ missionId: m1.id })).toEqual([i1.id]);
    expect(await ids({ sent: true })).toEqual([i1.id]);
    expect(await ids({ sent: false })).toEqual([i2.id]);
    expect(await invoices.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('billing directory: profile name, else email', async () => {
    await getTestPrisma().clientProfile.upsert({
      where: { userId: client.id },
      create: { userId: client.id, name: 'ACME SAS' },
      update: { name: 'ACME SAS' },
    });
    expect(await directory.findClient(client.id)).toEqual({
      clientId: client.id,
      name: 'ACME SAS',
      email: 'client@int.test',
    });
    expect((await directory.findClient(client2.id))?.name).toBe('client2@int.test');
    expect(await directory.findClient('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('GenerateClientInvoice with the real PDF adapter writes a valid PDF to storage', async () => {
    const p = submit(m1, 2400.5);
    p.validate(admin.id, NOW);
    await payments.save(p);
    const storage = new FakeFileStorage();
    const missions: PaymentMissionGatewayPort = {
      findMission: () => Promise.resolve({ ...m1, consultantIds: [] }),
      missionIdsForConsultant: () => Promise.resolve([]),
    };
    const uc = new GenerateClientInvoiceUseCase(
      payments,
      invoices,
      missions,
      directory,
      new SimplePdfGeneratorAdapter(),
      storage,
      new PaymentCommitter(
        new FakeAuditLog(),
        new FakeEventBus(),
        new BestEffortNotifier(new FakeNotifier()),
      ),
      new FixedClock(NOW),
    );
    const view = await uc.execute({ actor: actors.superadmin(admin.id), paymentId: p.id });
    const pdf = storage.files.get(`client-invoices/${view.id}.pdf`)!;
    expect(pdf.subarray(0, 8).toString()).toBe('%PDF-1.4');
    expect(pdf.toString('latin1')).toContain(`(Facture N\xb0 ${view.invoiceNumber}) Tj`);
    expect((await invoices.findById(view.id))!.pdfFile.size).toBe(pdf.length);
  });
});
