import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../utils/http-app';
import { getTestPrisma } from '../utils/test-db';
import { LifecycleWorld } from '../fixtures/lifecycle';

describe('deliverables (e2e)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;
  let w: LifecycleWorld;

  beforeAll(async () => {
    ({ app, close } = await createTestApp());
    w = new LifecycleWorld(app);
  });
  afterAll(() => close());
  beforeEach(() => w.reset());

  const upload = async (missionId: string, auth = w.auth.consultant2, name = 'rapport.pdf') =>
    w
      .api()
      .post('/api/consultant/deliverables')
      .set('Authorization', auth)
      .field('missionId', missionId)
      .attach('file', Buffer.from('rapport final'), name);

  it('consultant uploads → client does not see it → admin validates → client sees and validates', async () => {
    const mission = await w.activeMission();
    const res = await upload(mission.id);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      missionId: mission.id,
      consultantId: w.consultant2.id,
      adminValidated: false,
      clientValidated: false,
      fileName: 'rapport.pdf',
    });
    const id = res.body.id as string;

    // invisible to the client: list, get, download, validate
    const before = await w.api().get('/api/deliverables').set('Authorization', w.auth.client);
    expect(before.status).toBe(200);
    expect(before.body.data).toEqual([]);
    for (const path of [
      `/api/client/deliverables/${id}`,
      `/api/client/deliverables/${id}/download`,
    ]) {
      await w.api().get(path).set('Authorization', w.auth.client).expect(404);
    }
    await w
      .api()
      .patch(`/api/client/deliverables/${id}/validate`)
      .set('Authorization', w.auth.client)
      .expect(404);

    // the author sees it; the other consultant does not
    await w
      .api()
      .get(`/api/consultant/deliverables/${id}`)
      .set('Authorization', w.auth.consultant2)
      .expect(200);
    await w
      .api()
      .get(`/api/consultant/deliverables/${id}`)
      .set('Authorization', w.auth.consultant)
      .expect(404);
    const authorFile = await w
      .api()
      .get(`/api/consultant/deliverables/${id}/download`)
      .set('Authorization', w.auth.consultant2)
      .expect(200);
    expect(authorFile.headers['content-disposition']).toContain('rapport.pdf');

    // bare admin lacks validate-deliverables
    await w
      .api()
      .patch(`/api/admin/deliverables/${id}/validate`)
      .set('Authorization', w.auth.admin)
      .expect(403);
    await w
      .api()
      .patch(`/api/admin/deliverables/${id}/validate`)
      .set('Authorization', w.auth.superadmin)
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ adminValidated: true }));

    const after = await w.api().get('/api/deliverables').set('Authorization', w.auth.client);
    expect(after.body.data).toEqual([expect.objectContaining({ id, clientValidated: false })]);
    expect(after.body.data[0]).not.toHaveProperty('consultantId');
    await w
      .api()
      .get(`/api/client/deliverables/${id}/download`)
      .set('Authorization', w.auth.client)
      .expect(200);
    await w
      .api()
      .patch(`/api/client/deliverables/${id}/validate`)
      .set('Authorization', w.auth.client)
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ clientValidated: true }));
    // another client never sees it
    await w
      .api()
      .get(`/api/client/deliverables/${id}`)
      .set('Authorization', w.auth.client2)
      .expect(404);

    // the client was notified on release, the author on client validation
    const db = getTestPrisma();
    expect(
      await db.notification.count({ where: { userId: w.actors.client.id, type: 'deliverable' } }),
    ).toBe(1);
    expect(
      await db.notification.count({ where: { userId: w.consultant2.id, type: 'deliverable' } }),
    ).toBe(1);
  });

  it('list filters per audience', async () => {
    const mission = await w.activeMission();
    const a = (await upload(mission.id, w.auth.consultant2, 'a.pdf')).body.id as string;
    const b = (await upload(mission.id, w.auth.consultant, 'b.pdf')).body.id as string;
    await w
      .api()
      .patch(`/api/admin/deliverables/${b}/validate`)
      .set('Authorization', w.auth.superadmin)
      .expect(200);

    const ids = async (auth: string, query = '') =>
      (
        await w.api().get(`/api/deliverables${query}`).set('Authorization', auth).expect(200)
      ).body.data
        .map((d: { id: string }) => d.id)
        .sort();
    expect(await ids(w.auth.admin)).toEqual([a, b].sort());
    expect(await ids(w.auth.admin, `?consultantId=${w.consultant2.id}`)).toEqual([a]);
    expect(await ids(w.auth.admin, '?adminValidated=false')).toEqual([a]);
    expect(await ids(w.auth.admin, `?missionId=${mission.id}&validated=false`)).toEqual(
      [a, b].sort(),
    );
    expect(await ids(w.auth.admin, '?uploadedFrom=2099-01-01')).toEqual([]);
    expect(await ids(w.auth.consultant2)).toEqual([a]);
    expect(await ids(w.auth.consultant, `?consultantId=${w.consultant2.id}`)).toEqual([b]);
    expect(await ids(w.auth.client, '?adminValidated=false')).toEqual([b]);
    await w
      .api()
      .get(`/api/admin/deliverables/${a}`)
      .set('Authorization', w.auth.admin)
      .expect(200)
      .expect((r) => expect(r.body.consultantId).toBe(w.consultant2.id));
  });

  it('a consultant cannot deliver before signing their engagement with The Cleverest (403)', async () => {
    const mission = await w.activeMission({ engaged: false });
    await upload(mission.id).then((r) => {
      expect(r.status).toBe(403);
      expect(r.body.error).toBe('CONSULTANT_CONTRACT_NOT_SIGNED');
    });
    const contract = await w.consultantContract(mission.quoteId, w.consultant2.id, 300);
    await upload(mission.id).then((r) => expect(r.status).toBe(403)); // drawn up, not signed yet
    await w.signConsultantContract(contract.id, w.auth.consultant2);
    await upload(mission.id).then((r) => expect(r.status).toBe(201));
    // the lead is still not engaged
    await upload(mission.id, w.auth.consultant).then((r) => expect(r.status).toBe(403));
  });

  it('guards: outsider 404, pending mission 409, missing file 422, roles 401/403', async () => {
    const pending = await w.newMission();
    await w
      .api()
      .post(`/api/admin/missions/${pending.id}/assign`)
      .set('Authorization', w.auth.superadmin)
      .send({ consultants: [{ id: w.actors.consultant.id }] })
      .expect(200);
    await upload(pending.id, w.auth.consultant).then((r) => {
      expect(r.status).toBe(409);
      expect(r.body.error).toBe('MISSION_NOT_ACTIVE');
    });
    await upload(pending.id, w.auth.consultant2).then((r) => expect(r.status).toBe(404));
    await w
      .api()
      .post('/api/consultant/deliverables')
      .set('Authorization', w.auth.consultant)
      .field('missionId', pending.id)
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('FILE_REQUIRED'));
    await w.api().get('/api/deliverables').expect(401);
    await upload(pending.id, w.auth.client).then((r) => expect(r.status).toBe(403));
  });
});
