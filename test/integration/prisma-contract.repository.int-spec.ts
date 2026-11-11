import { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import { PrismaUnitOfWork } from '../../src/shared/infrastructure/database/prisma-unit-of-work';
import { PrismaQuoteRepository } from '../../src/modules/quotes/infrastructure/persistence/prisma-quote.repository';
import { PrismaContractRepository } from '../../src/modules/contracts/infrastructure/persistence/prisma-contract.repository';
import { Contract } from '../../src/modules/contracts/domain';
import {
  Money,
  Quote,
  QuoteActor,
  QuoteStatus,
  QuoteType,
  RequestNumber,
} from '../../src/modules/quotes/domain';
import { getTestPrisma } from '../utils/test-db';
import { seedRbac } from '../fixtures/seed-rbac';
import { createUser, SeededUser } from '../fixtures/quotes';

const NOW = new Date('2026-04-01T09:00:00.000Z');
const pdf = (name: string) => ({
  key: `contracts/${name}`,
  originalName: name,
  mimeType: 'application/pdf',
  size: 42,
});

describe('PrismaContractRepository (integration)', () => {
  const prisma = new PrismaService();
  const quotes = new PrismaQuoteRepository(prisma);
  const repo = new PrismaContractRepository(prisma);
  const uow = new PrismaUnitOfWork(prisma);
  let client: SeededUser;
  let client2: SeededUser;
  let seq = 0;

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    const db = getTestPrisma();
    await seedRbac(db);
    client = await createUser(db, 'client@int.test', 'client');
    client2 = await createUser(db, 'client2@int.test', 'client');
    seq = 0;
  });

  /** a VALIDÉ_ADMIN quote persisted for `clientId` */
  const validatedQuote = async (clientId: string): Promise<Quote> => {
    const q = Quote.create(
      {
        id: quotes.nextIdentity(),
        clientId,
        requestNumber: RequestNumber.fromSequence(++seq),
        type: QuoteType.CONSULTATION,
        title: 'Audit',
        description: 'Besoin',
      },
      clientId,
      NOW,
    );
    q.reviewByAdmin(
      { status: QuoteStatus.VALIDE_ADMIN, price: Money.of(100) },
      { actorId: clientId, actor: QuoteActor.ADMIN },
      NOW,
    );
    await quotes.save(q);
    return q;
  };

  const contractFor = (q: Quote, at = NOW) =>
    Contract.create(
      {
        id: repo.nextIdentity(),
        quote: {
          id: q.id,
          clientId: q.clientId,
          requestNumber: q.requestNumber.value,
          status: q.status,
          isSubquote: false,
          readyForContract: true,
          parentQuoteId: null,
          price: 100,
          consultantIds: [],
          priceValidated: true,
        },
        originalFile: pdf('original.pdf'),
        createdById: q.clientId,
        alreadyExists: false,
      },
      at,
    );

  it('round-trips an unsigned then signed contract', async () => {
    const q = await validatedQuote(client.id);
    const c = contractFor(q);
    await repo.save(c);
    const back = await repo.findById(c.id);
    expect(back).toMatchObject({ quoteId: q.id, clientId: client.id, signed: false });
    expect(back!.originalFile).toEqual(pdf('original.pdf'));
    expect(back!.signedFile).toBeNull();
    expect(await repo.existsForQuote(q.id)).toBe(true);
    expect(await quotes.hasContract(q.id)).toBe(true);

    back!.sign(client.id, pdf('signed.pdf'), NOW);
    await repo.save(back!);
    const signed = await repo.findById(c.id);
    expect(signed).toMatchObject({ signed: true, signedAt: NOW });
    expect(signed!.signedFile).toEqual(pdf('signed.pdf'));
    expect(await repo.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('one contract per quote: the unique index maps to CONTRACT_ALREADY_EXISTS', async () => {
    const q = await validatedQuote(client.id);
    await repo.save(contractFor(q));
    await expect(repo.save(contractFor(q))).rejects.toMatchObject({
      code: 'CONTRACT_ALREADY_EXISTS',
      httpStatus: 409,
    });
  });

  it('the CHECK constraint refuses signed=true without a signed file', async () => {
    const q = await validatedQuote(client.id);
    const c = contractFor(q);
    await repo.save(c);
    await expect(
      getTestPrisma().contract.update({ where: { id: c.id }, data: { signed: true } }),
    ).rejects.toThrow();
  });

  it('saves inside a unit of work and rolls back with it', async () => {
    const q = await validatedQuote(client.id);
    const c = contractFor(q);
    await expect(
      uow.run(async (tx) => {
        await repo.save(c, tx);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await repo.findById(c.id)).toBeNull();
  });

  it('list() filters by client, quote, signed and date range; quotes filter by hasContract', async () => {
    const q1 = await validatedQuote(client.id);
    const q2 = await validatedQuote(client.id);
    const q3 = await validatedQuote(client2.id);
    const free = await validatedQuote(client.id);
    const c1 = contractFor(q1, new Date('2026-01-10T00:00:00Z'));
    const c2 = contractFor(q2);
    const c3 = contractFor(q3);
    c2.sign(client.id, pdf('s.pdf'), NOW);
    for (const c of [c1, c2, c3]) await repo.save(c);

    const ids = async (f: Parameters<typeof repo.list>[1]) =>
      (await repo.list({ page: 1, perPage: 50 }, f)).data.map((c) => c.id).sort();
    expect(await ids({})).toHaveLength(3);
    expect(await ids({ clientId: client.id })).toEqual([c1.id, c2.id].sort());
    expect(await ids({ quoteId: q3.id })).toEqual([c3.id]);
    expect(await ids({ signed: true })).toEqual([c2.id]);
    expect(await ids({ signed: false })).toEqual([c1.id, c3.id].sort());
    expect(await ids({ dateTo: new Date('2026-02-01') })).toEqual([c1.id]);
    expect(await ids({ dateFrom: new Date('2026-02-01') })).toEqual([c2.id, c3.id].sort());
    const page = await repo.list({ page: 2, perPage: 2, sort: 'createdAt:asc' }, {});
    expect(page.meta).toEqual({ page: 2, perPage: 2, total: 3, totalPages: 2 });
    expect((await repo.list({ page: 1, perPage: 5, sort: 'x:asc' }, {})).data).toHaveLength(3);

    const quoteIds = async (hasContract: boolean) =>
      (await quotes.list({ page: 1, perPage: 50 }, { hasContract })).data.map((q) => q.id).sort();
    expect(await quoteIds(true)).toEqual([q1.id, q2.id, q3.id].sort());
    expect(await quoteIds(false)).toEqual([free.id]);
  });
});
