import { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import { PrismaUnitOfWork } from '../../src/shared/infrastructure/database/prisma-unit-of-work';
import { PrismaQuoteRepository } from '../../src/modules/quotes/infrastructure/persistence/prisma-quote.repository';
import { PrismaConsultantContractRepository } from '../../src/modules/contracts/infrastructure/persistence/prisma-consultant-contract.repository';
import { ConsultantContract, QuoteForContract } from '../../src/modules/contracts/domain';
import { Quote, QuoteActor, QuoteType, RequestNumber } from '../../src/modules/quotes/domain';
import { getTestPrisma } from '../utils/test-db';
import { seedRbac } from '../fixtures/seed-rbac';
import { createUser, SeededUser } from '../fixtures/quotes';

const NOW = new Date('2026-04-01T09:00:00.000Z');
const LATER = new Date('2026-04-02T09:00:00.000Z');
const pdf = (name: string) => ({
  key: `consultant-contracts/${name}`,
  originalName: name,
  mimeType: 'application/pdf',
  size: 42,
});

describe('PrismaConsultantContractRepository (integration)', () => {
  const prisma = new PrismaService();
  const quotes = new PrismaQuoteRepository(prisma);
  const repo = new PrismaConsultantContractRepository(prisma);
  const uow = new PrismaUnitOfWork(prisma);
  let client: SeededUser;
  let c1: SeededUser;
  let c2: SeededUser;
  let admin: SeededUser;
  let main: Quote;
  let sub1: Quote;
  let sub2: Quote;

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    const db = getTestPrisma();
    await seedRbac(db);
    client = await createUser(db, 'client@int.test', 'client');
    c1 = await createUser(db, 'c1@int.test', 'consultant');
    c2 = await createUser(db, 'c2@int.test', 'consultant');
    admin = await createUser(db, 'admin@int.test', 'admin');
    const by = { actorId: admin.id, actor: QuoteActor.ADMIN };
    main = Quote.create(
      {
        id: quotes.nextIdentity(),
        clientId: client.id,
        requestNumber: RequestNumber.fromSequence(1),
        type: QuoteType.CONSULTATION,
        title: 'Audit',
        description: 'Besoin',
      },
      client.id,
      NOW,
    );
    [sub1, sub2] = main.split(
      [
        {
          id: quotes.nextIdentity(),
          requestNumber: RequestNumber.fromSequence(2),
          consultantId: c1.id,
        },
        {
          id: quotes.nextIdentity(),
          requestNumber: RequestNumber.fromSequence(3),
          consultantId: c2.id,
        },
      ],
      by,
      NOW,
    );
    await uow.run(async (tx) => {
      for (const q of [main, sub1, sub2]) await quotes.save(q, tx);
    });
  });

  const asSeen = (q: Quote, price: number): QuoteForContract => ({
    id: q.id,
    clientId: q.clientId,
    requestNumber: q.requestNumber.value,
    status: 'VALIDÉ_ADMIN',
    isSubquote: q.isSubquote,
    readyForContract: true,
    parentQuoteId: q.parentQuoteId,
    price,
    consultantIds: q.consultantIds,
    priceValidated: true,
  });

  const make = (q: Quote, consultantId: string, price = 1234.56) =>
    ConsultantContract.create(
      {
        id: repo.nextIdentity(),
        quote: asSeen(q, price),
        consultantId,
        originalFile: pdf(`${consultantId}.pdf`),
        createdById: admin.id,
        alreadyExists: false,
      },
      NOW,
    );

  it('round-trips the aggregate (decimal amount, root quote, signed file)', async () => {
    const c = make(sub1, c1.id);
    await repo.save(c);
    let back = await repo.findById(c.id);
    expect(back).toMatchObject({
      quoteId: sub1.id,
      rootQuoteId: main.id,
      consultantId: c1.id,
      amount: 1234.56,
      signed: false,
      signedFile: null,
    });
    expect(back!.originalFile).toEqual(pdf(`${c1.id}.pdf`));

    c.sign(c1.id, pdf('signed.pdf'), LATER);
    await repo.save(c);
    back = await repo.findById(c.id);
    expect(back).toMatchObject({ signed: true, signedAt: LATER });
    expect(back!.signedFile?.originalName).toBe('signed.pdf');
    expect(await repo.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('existsFor / hasSigned: signed engagement on any subquote counts for the main quote', async () => {
    const c = make(sub1, c1.id);
    await repo.save(c);
    expect(await repo.existsFor(sub1.id, c1.id)).toBe(true);
    expect(await repo.existsFor(sub2.id, c1.id)).toBe(false);
    expect(await repo.hasSigned(c1.id, main.id)).toBe(false);
    c.sign(c1.id, pdf('s.pdf'), LATER);
    await repo.save(c);
    expect(await repo.hasSigned(c1.id, main.id)).toBe(true);
    expect(await repo.hasSigned(c2.id, main.id)).toBe(false);
  });

  it('one contract per (quote, consultant): duplicate → CONSULTANT_CONTRACT_ALREADY_EXISTS', async () => {
    await repo.save(make(sub1, c1.id));
    await expect(repo.save(make(sub1, c1.id))).rejects.toMatchObject({
      code: 'CONSULTANT_CONTRACT_ALREADY_EXISTS',
      httpStatus: 409,
    });
  });

  it('the database refuses a non-positive amount and an inconsistent signature', async () => {
    const db = getTestPrisma();
    const base = {
      quoteId: sub1.id,
      rootQuoteId: main.id,
      consultantId: c1.id,
      originalFileKey: 'k',
      originalFileName: 'o.pdf',
      originalSize: 1,
    };
    await expect(db.consultantContract.create({ data: { ...base, amount: 0 } })).rejects.toThrow();
    await expect(
      db.consultantContract.create({ data: { ...base, amount: 5, signedAt: NOW } }),
    ).rejects.toThrow();
  });

  it('a bound quote is reported by hasContract and cannot be deleted from the database', async () => {
    await repo.save(make(sub2, c2.id));
    expect(await quotes.hasContract(main.id)).toBe(true); // via the root quote
    expect(await quotes.hasContract(sub2.id)).toBe(true);
    expect(await quotes.hasContract(sub1.id)).toBe(false);
    await expect(quotes.delete(main.id)).rejects.toThrow();
  });

  it('list filters and paginates; delete removes the row', async () => {
    const a = make(sub1, c1.id, 100);
    const b = make(sub2, c2.id, 200);
    b.sign(c2.id, pdf('s.pdf'), LATER);
    await repo.save(a);
    await repo.save(b);
    const ids = async (f: Parameters<typeof repo.list>[1]) =>
      (await repo.list({ page: 1, perPage: 10 }, f)).data.map((c) => c.id).sort();

    expect(await ids({})).toHaveLength(2);
    expect(await ids({ consultantId: c1.id })).toEqual([a.id]);
    expect(await ids({ quoteId: sub2.id })).toEqual([b.id]);
    expect(await ids({ rootQuoteId: main.id })).toEqual([a.id, b.id].sort());
    expect(await ids({ signed: true })).toEqual([b.id]);
    expect(await ids({ signed: false })).toEqual([a.id]);
    const sorted = await repo.list({ page: 1, perPage: 1, sort: 'amount:asc' }, {});
    expect(sorted.data.map((c) => c.amount)).toEqual([100]);
    expect(sorted.meta.total).toBe(2);
    expect((await repo.list({ page: 1, perPage: 10, sort: 'hack:asc' }, {})).data).toHaveLength(2);

    await repo.delete(a.id);
    expect(await repo.findById(a.id)).toBeNull();
  });
});
