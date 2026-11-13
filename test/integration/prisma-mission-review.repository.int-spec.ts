import { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import {
  PrismaMissionReviewQueries,
  PrismaMissionReviewRepository,
} from '../../src/modules/reviews/infrastructure/persistence/prisma-mission-review.repository';
import { MissionForReview, MissionReview } from '../../src/modules/reviews/domain';
import { getTestPrisma } from '../utils/test-db';
import { seedRbac } from '../fixtures/seed-rbac';
import { createUser, SeededUser } from '../fixtures/quotes';
import { insertMission } from '../fixtures/missions';

const NOW = new Date('2026-09-01T10:00:00.000Z');
const LATER = new Date('2026-09-03T10:00:00.000Z');

describe('PrismaMissionReviewRepository (integration)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaMissionReviewRepository(prisma);
  const queries = new PrismaMissionReviewQueries(prisma);
  let client: SeededUser;
  let client2: SeededUser;

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    const db = getTestPrisma();
    await seedRbac(db);
    client = await createUser(db, 'client@int.test', 'client');
    client2 = await createUser(db, 'client2@int.test', 'client');
    await db.clientProfile.upsert({
      where: { userId: client.id },
      create: { userId: client.id, name: 'ACME' },
      update: { name: 'ACME' },
    });
  });

  const completed = async (clientId: string, title = 'Audit fiscal'): Promise<MissionForReview> => {
    const m = await insertMission(getTestPrisma(), clientId, [], title);
    await getTestPrisma().mission.update({ where: { id: m.id }, data: { status: 'TERMINEE' } });
    return { id: m.id, clientId, consultantIds: [], completed: true };
  };

  const review = (mission: MissionForReview, rating = 4, at = NOW, id = repo.nextIdentity()) =>
    MissionReview.submit({ id, mission, clientId: mission.clientId, rating, comment: 'Bien' }, at);

  it('stores a UUID primary key and round-trips the review', async () => {
    const r = review(await completed(client.id));
    await repo.save(r);
    const cols = await getTestPrisma().$queryRaw<Array<{ data_type: string }>>`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'mission_reviews' AND column_name = 'id'`;
    expect(cols[0].data_type).toBe('uuid');
    expect(await repo.findById(r.id)).toMatchObject({
      id: r.id,
      missionId: r.missionId,
      clientId: client.id,
      rating: 4,
      comment: 'Bien',
      createdAt: NOW,
    });
    expect(await repo.findByMissionAndClient(r.missionId, client.id)).toMatchObject({ id: r.id });
    expect(await repo.findByMissionAndClient(r.missionId, client2.id)).toBeNull();
    expect(await repo.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('save() upserts on (missionId, clientId): a second review of the pair updates the row', async () => {
    const mission = await completed(client.id);
    const first = review(mission, 5);
    await repo.save(first);
    // a concurrent first submission (new id) for the same pair: no duplicate, no error
    await repo.save(review(mission, 2, LATER));
    const db = getTestPrisma();
    expect(await db.missionReview.count()).toBe(1);
    expect(await repo.findByMissionAndClient(mission.id, client.id)).toMatchObject({
      id: first.id,
      rating: 2,
      createdAt: NOW,
      updatedAt: LATER,
    });
    // the unique index itself
    await expect(
      db.missionReview.create({
        data: { missionId: mission.id, clientId: client.id, rating: 3, updatedAt: NOW },
      }),
    ).rejects.toThrow();
  });

  it('the database enforces the 1-5 rating range', async () => {
    const mission = await completed(client.id);
    const db = getTestPrisma();
    for (const rating of [0, 6]) {
      await expect(
        db.missionReview.create({
          data: { missionId: mission.id, clientId: client.id, rating, updatedAt: NOW },
        }),
      ).rejects.toThrow();
    }
  });

  it('the admin read model joins mission and client, filters and paginates', async () => {
    const m1 = await completed(client.id, 'Audit fiscal');
    const m2 = await completed(client.id, 'Paie');
    const m3 = await completed(client2.id, 'Social');
    const r1 = review(m1, 5);
    const r2 = review(m2, 2, LATER);
    const r3 = review(m3, 4);
    for (const r of [r1, r2, r3]) await repo.save(r);

    expect(await queries.findById(r1.id)).toEqual({
      id: r1.id,
      rating: 5,
      comment: 'Bien',
      createdAt: NOW,
      updatedAt: NOW,
      mission: { id: m1.id, title: 'Audit fiscal', status: 'TERMINÉE' },
      client: { id: client.id, name: 'ACME', email: 'client@int.test' },
    });
    expect((await queries.findById(r3.id))!.client.name).toBeNull();
    expect(await queries.findById('00000000-0000-4000-8000-000000000000')).toBeNull();

    const ids = async (f: Parameters<typeof queries.list>[1]) =>
      (await queries.list({ page: 1, perPage: 50 }, f)).data.map((d) => d.id).sort();
    expect(await ids({})).toHaveLength(3);
    expect(await ids({ clientId: client.id })).toEqual([r1.id, r2.id].sort());
    expect(await ids({ missionId: m3.id })).toEqual([r3.id]);
    expect(await ids({ minRating: 4 })).toEqual([r1.id, r3.id].sort());
    expect(await ids({ maxRating: 3 })).toEqual([r2.id]);
    const page = await queries.list({ page: 1, perPage: 2, sort: 'rating:asc' }, {});
    expect(page.data.map((d) => d.rating)).toEqual([2, 4]);
    expect(page.meta).toEqual({ page: 1, perPage: 2, total: 3, totalPages: 2 });
    const byDate = await queries.list({ page: 1, perPage: 5, sort: 'x:desc' }, {});
    expect(byDate.data[0].id).toBe(r2.id); // unknown field → createdAt desc; r2 is the latest
  });
});
