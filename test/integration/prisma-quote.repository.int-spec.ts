import { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import { PrismaUnitOfWork } from '../../src/shared/infrastructure/database/prisma-unit-of-work';
import { PrismaQuoteRepository } from '../../src/modules/quotes/infrastructure/persistence/prisma-quote.repository';
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

const NOW = new Date('2026-03-01T10:00:00.000Z');
const admin = (id: string) => ({ actorId: id, actor: QuoteActor.ADMIN });
const byId = (a: { consultantId: string }, b: { consultantId: string }) =>
  a.consultantId.localeCompare(b.consultantId);

describe('PrismaQuoteRepository (integration)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaQuoteRepository(prisma);
  const uow = new PrismaUnitOfWork(prisma);
  let client: SeededUser;
  let client2: SeededUser;
  let c1: SeededUser;
  let c2: SeededUser;
  let adm: SeededUser;

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    const db = getTestPrisma();
    await seedRbac(db);
    client = await createUser(db, 'client@int.test', 'client');
    client2 = await createUser(db, 'client2@int.test', 'client');
    c1 = await createUser(db, 'c1@int.test', 'consultant', { expertiseDomains: ['tax'] });
    c2 = await createUser(db, 'c2@int.test', 'consultant');
    adm = await createUser(db, 'admin@int.test', 'admin');
  });

  const make = (clientId: string, seq: number, at = NOW) =>
    Quote.create(
      {
        id: repo.nextIdentity(),
        clientId,
        requestNumber: RequestNumber.fromSequence(seq),
        type: QuoteType.CONSULTATION,
        title: 'Audit',
        description: 'Besoin',
      },
      clientId,
      at,
    );

  it('persists the full aggregate (accented status, price, pivot with isLead) and reads it back', async () => {
    const q = make(client.id, 1);
    q.assignConsultants(
      [
        { consultantId: c1.id, isLead: false },
        { consultantId: c2.id, isLead: true },
      ],
      admin(adm.id),
      NOW,
    );
    q.submitByConsultant(
      { price: Money.of(1234.5), consultantNotes: 'n' },
      { actorId: c2.id, actor: QuoteActor.CONSULTANT },
      NOW,
    );
    await repo.save(q);

    const raw = await getTestPrisma().$queryRaw<
      Array<{ status: string }>
    >`SELECT status::text AS status FROM quotes`;
    expect(raw[0].status).toBe('COTÉ');

    const back = await repo.findById(q.id);
    expect(back!.status).toBe(QuoteStatus.COTE);
    expect(back!.price?.amount).toBe(1234.5);
    expect(back!.leadConsultantId).toBe(c2.id);
    expect(back!.consultants.sort(byId)).toEqual(
      [
        { consultantId: c1.id, isLead: false },
        { consultantId: c2.id, isLead: true },
      ].sort(byId),
    );
    expect(back!.requestNumber.value).toBe('req-001');
    expect(back!.quotedById).toBe(c2.id);
    expect(back!.consultantDeadline).toEqual(q.consultantDeadline);
  });

  it('switching the lead and dropping a consultant syncs the pivot', async () => {
    const q = make(client.id, 1);
    q.assignConsultants(
      [
        { consultantId: c1.id, isLead: true },
        { consultantId: c2.id, isLead: false },
      ],
      admin(adm.id),
      NOW,
    );
    await repo.save(q);
    q.setLead(c2.id, admin(adm.id), NOW);
    await repo.save(q);
    expect((await repo.findById(q.id))!.leadConsultantId).toBe(c2.id);

    q.assignConsultants([{ consultantId: c1.id, isLead: false }], admin(adm.id), NOW);
    await repo.save(q);
    expect((await repo.findById(q.id))!.consultants).toEqual([
      { consultantId: c1.id, isLead: false },
    ]);
  });

  it('the database refuses two leads on the same quote', async () => {
    const q = make(client.id, 1);
    await repo.save(q);
    const db = getTestPrisma();
    await db.quoteConsultant.create({ data: { quoteId: q.id, consultantId: c1.id, isLead: true } });
    await expect(
      db.quoteConsultant.create({ data: { quoteId: q.id, consultantId: c2.id, isLead: true } }),
    ).rejects.toThrow();
  });

  it('saves parent + subquotes in one unit of work; findSubquotes / hasSubquotes / delete cascade', async () => {
    const parent = make(client.id, 1);
    await repo.save(parent);
    const children = parent.split(
      [
        {
          id: repo.nextIdentity(),
          requestNumber: RequestNumber.fromSequence(2),
          consultantId: c1.id,
        },
        {
          id: repo.nextIdentity(),
          requestNumber: RequestNumber.fromSequence(3),
          consultantId: c2.id,
        },
      ],
      admin(adm.id),
      NOW,
    );
    await uow.run(async (tx) => {
      for (const q of [parent, ...children]) await repo.save(q, tx);
    });
    expect(await repo.hasSubquotes(parent.id)).toBe(true);
    expect((await repo.findSubquotes(parent.id)).map((s) => s.requestNumber.value)).toEqual([
      'req-002',
      'req-003',
    ]);
    expect((await repo.findById(parent.id))!.status).toBe(QuoteStatus.TRAITEMENT_CONSULTANT);
    expect(await repo.lastRequestSequence()).toBe(3);

    await repo.delete(parent.id);
    expect(await getTestPrisma().quote.count()).toBe(0);
    expect(await getTestPrisma().quoteConsultant.count()).toBe(0);
  });

  it('rolls back the unit of work and maps a duplicate request number to REQUEST_NUMBER_TAKEN', async () => {
    const a = make(client.id, 1);
    await repo.save(a);
    const fresh = make(client.id, 50);
    const dup = make(client.id, 1);
    await expect(
      uow.run(async (tx) => {
        await repo.save(fresh, tx);
        await repo.save(dup, tx);
      }),
    ).rejects.toMatchObject({ code: 'REQUEST_NUMBER_TAKEN', httpStatus: 409 });
    expect(await repo.findById(fresh.id)).toBeNull();
    // outside a unit of work too
    await expect(repo.save(make(client.id, 1))).rejects.toMatchObject({
      code: 'REQUEST_NUMBER_TAKEN',
    });
  });

  it('lastRequestSequence is numeric (req-1000 > req-999) and 0 on an empty table', async () => {
    expect(await repo.lastRequestSequence()).toBe(0);
    await repo.save(make(client.id, 999));
    await repo.save(make(client.id, 1000));
    expect(await repo.lastRequestSequence()).toBe(1000);
  });

  it('list() applies every filter and paginates', async () => {
    const old = make(client.id, 1, new Date('2025-01-15T00:00:00Z'));
    await repo.save(old);
    const validated = make(client.id, 2);
    validated.reviewByAdmin(
      { status: QuoteStatus.VALIDE_ADMIN, price: Money.of(10) },
      admin(adm.id),
      NOW,
    );
    await repo.save(validated);
    const other = make(client2.id, 3);
    other.assignConsultants([{ consultantId: c1.id, isLead: true }], admin(adm.id), NOW);
    const [sub] = other.split(
      [
        {
          id: repo.nextIdentity(),
          requestNumber: RequestNumber.fromSequence(4),
          consultantId: c2.id,
        },
      ],
      admin(adm.id),
      NOW,
    );
    await repo.save(other);
    await repo.save(sub);

    const ids = async (filter: Parameters<typeof repo.list>[1]) =>
      (await repo.list({ page: 1, perPage: 50 }, filter)).data.map((q) => q.id).sort();

    expect(await ids({})).toHaveLength(4);
    expect(await ids({ clientId: client.id })).toEqual([old.id, validated.id].sort());
    expect(await ids({ status: QuoteStatus.VALIDE_ADMIN })).toEqual([validated.id]);
    expect(await ids({ type: QuoteType.ABONNEMENT })).toEqual([]);
    expect(await ids({ isValidated: true })).toEqual([validated.id]);
    expect(await ids({ isValidated: false })).toHaveLength(3);
    expect(await ids({ isSubquote: true })).toEqual([sub.id]);
    expect(await ids({ isSubquote: false })).toHaveLength(3);
    expect(await ids({ parentQuoteId: other.id })).toEqual([sub.id]);
    expect(await ids({ consultantId: c1.id })).toEqual([other.id]);
    expect(await ids({ consultantId: c2.id })).toEqual([sub.id]);
    expect(await ids({ dateMax: new Date('2025-12-31') })).toEqual([old.id]);
    expect(await ids({ dateMin: new Date('2026-01-01') })).toHaveLength(3);
    expect(await ids({ dateMin: new Date('2025-01-01'), dateMax: new Date('2025-02-01') })).toEqual(
      [old.id],
    );

    const page = await repo.list({ page: 2, perPage: 3, sort: 'requestNumber:asc' }, {});
    expect(page.meta).toEqual({ page: 2, perPage: 3, total: 4, totalPages: 2 });
    expect(page.data.map((q) => q.requestNumber.value)).toEqual(['req-004']);
    const unknownSort = await repo.list({ page: 1, perPage: 10, sort: 'hack:asc' }, {});
    expect(unknownSort.data).toHaveLength(4);
  });
});
