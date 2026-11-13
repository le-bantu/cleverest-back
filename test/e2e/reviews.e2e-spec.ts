import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../utils/http-app';
import { getTestPrisma } from '../utils/test-db';
import { LifecycleWorld } from '../fixtures/lifecycle';

describe('mission reviews (e2e)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;
  let w: LifecycleWorld;

  beforeAll(async () => {
    ({ app, close } = await createTestApp());
    w = new LifecycleWorld(app);
  });
  afterAll(() => close());
  beforeEach(() => w.reset());

  const post = (auth: string, body: object) =>
    w.api().post('/api/reviews').set('Authorization', auth).send(body);

  it('client rates a completed mission → admin sees it; a second POST updates (no duplicate)', async () => {
    const mission = await w.completedMission();
    const created = await post(w.auth.client, {
      missionId: mission.id,
      rating: 5,
      comment: 'Excellent accompagnement',
    }).expect(201);
    expect(created.body).toMatchObject({
      missionId: mission.id,
      clientId: w.actors.client.id,
      rating: 5,
      comment: 'Excellent accompagnement',
    });

    const updated = await post(w.auth.client, { missionId: mission.id, rating: 3 }).expect(200);
    expect(updated.body).toMatchObject({ id: created.body.id, rating: 3, comment: null });
    expect(await getTestPrisma().missionReview.count()).toBe(1);

    const list = await w
      .api()
      .get('/api/admin/reviews?minRating=3')
      .set('Authorization', w.auth.admin)
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({
      id: created.body.id,
      rating: 3,
      mission: { id: mission.id, status: 'TERMINÉE' },
      client: { id: w.actors.client.id, email: w.actors.client.email },
    });
    await w
      .api()
      .get(`/api/admin/reviews/${created.body.id as string}`)
      .set('Authorization', w.auth.superadmin)
      .expect(200)
      .expect((r) => expect(r.body.mission.title).toEqual(expect.any(String)));

    // the client and the mission's consultants read it; others do not learn it exists
    for (const auth of [w.auth.client, w.auth.consultant, w.auth.admin]) {
      await w
        .api()
        .get(`/api/reviews/missions/${mission.id}`)
        .set('Authorization', auth)
        .expect(200)
        .expect((r) => expect(r.body.rating).toBe(3));
    }
    await w
      .api()
      .get(`/api/reviews/missions/${mission.id}`)
      .set('Authorization', w.auth.client2)
      .expect(404)
      .expect((r) => expect(r.body.error).toBe('MISSION_NOT_FOUND'));

    const audit = await getTestPrisma().auditLog.findMany({
      where: { entity: 'MissionReview' },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => a.action)).toEqual(['CREATED', 'UPDATED']);
  });

  it('refuses a mission that is not TERMINÉE, a foreign mission and out-of-range ratings', async () => {
    const mission = await w.activeMission();
    await post(w.auth.client, { missionId: mission.id, rating: 4 })
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('MISSION_NOT_COMPLETED'));
    await post(w.auth.client2, { missionId: mission.id, rating: 4 })
      .expect(404)
      .expect((r) => expect(r.body.error).toBe('MISSION_NOT_FOUND'));
    for (const rating of [0, 6, 4.5]) {
      await post(w.auth.client, { missionId: mission.id, rating }).expect(400);
    }
    await w
      .api()
      .get(`/api/reviews/missions/${mission.id}`)
      .set('Authorization', w.auth.client)
      .expect(404)
      .expect((r) => expect(r.body.error).toBe('MISSION_REVIEW_NOT_FOUND'));
    expect(await getTestPrisma().missionReview.count()).toBe(0);
  });

  it('guards: only clients post, only admins list', async () => {
    const mission = await w.completedMission();
    await post(w.auth.consultant, { missionId: mission.id, rating: 4 }).expect(403);
    await post(w.auth.apporteur, { missionId: mission.id, rating: 4 }).expect(403);
    await w.api().post('/api/reviews').send({ missionId: mission.id, rating: 4 }).expect(401);
    await w.api().get('/api/admin/reviews').set('Authorization', w.auth.client).expect(403);
    await w
      .api()
      .get(`/api/reviews/missions/${mission.id}`)
      .set('Authorization', w.auth.apporteur)
      .expect(403);
  });
});
