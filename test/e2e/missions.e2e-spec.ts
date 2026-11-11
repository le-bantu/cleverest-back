import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../utils/http-app';
import { getTestPrisma } from '../utils/test-db';
import { LifecycleWorld } from '../fixtures/lifecycle';

describe('missions (e2e)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;
  let w: LifecycleWorld;

  beforeAll(async () => {
    ({ app, close } = await createTestApp());
    w = new LifecycleWorld(app);
  });
  afterAll(() => close());
  beforeEach(() => w.reset());

  it('admin opens → assigns (lead from quote) → lead accepts → 3 tasks → 2 done → progress 67', async () => {
    const mission = await w.newMission();
    const assigned = await w
      .api()
      .post(`/api/admin/missions/${mission.id}/assign`)
      .set('Authorization', w.auth.superadmin)
      .send({ consultants: [{ id: w.consultant2.id }, { id: w.actors.consultant.id }] })
      .expect(200);
    // no explicit lead → the quote's lead
    expect(assigned.body).toMatchObject({
      status: 'EN_ATTENTE',
      leadConsultantId: w.actors.consultant.id,
    });

    // only the lead answers
    await w
      .api()
      .post(`/api/missions/${mission.id}/respond`)
      .set('Authorization', w.auth.consultant2)
      .send({ action: 'accept' })
      .expect(403)
      .expect((r) => expect(r.body.error).toBe('MISSION_LEAD_REQUIRED'));
    await w
      .api()
      .post(`/api/missions/${mission.id}/respond`)
      .set('Authorization', w.auth.consultant)
      .send({ action: 'accept' })
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ status: 'EN_COURS', isLead: true }));

    const tasks: string[] = [];
    for (const title of ['Collecte', 'Analyse', 'Rapport']) {
      const res = await w
        .api()
        .post(`/api/missions/${mission.id}/tasks`)
        .set('Authorization', w.auth.consultant)
        .send({ title, assigneeConsultantId: w.consultant2.id })
        .expect(201);
      tasks.push(res.body.id as string);
    }
    // non-lead cannot create tasks
    await w
      .api()
      .post(`/api/missions/${mission.id}/tasks`)
      .set('Authorization', w.auth.consultant2)
      .send({ title: 'x' })
      .expect(403);

    // the assignee completes two of them
    for (const taskId of tasks.slice(0, 2)) {
      await w
        .api()
        .patch(`/api/missions/${mission.id}/tasks/${taskId}`)
        .set('Authorization', w.auth.consultant2)
        .send({ status: 'FAITE' })
        .expect(200)
        .expect((r) => expect(r.body.status).toBe('FAITE'));
    }
    // …but may not rename them
    await w
      .api()
      .patch(`/api/missions/${mission.id}/tasks/${tasks[2]}`)
      .set('Authorization', w.auth.consultant2)
      .send({ title: 'hack' })
      .expect(403)
      .expect((r) => expect(r.body.error).toBe('TASK_UPDATE_FORBIDDEN'));

    const detail = await w
      .api()
      .get(`/api/admin/missions/${mission.id}`)
      .set('Authorization', w.auth.superadmin)
      .expect(200);
    expect(detail.body).toMatchObject({
      progress: 67,
      progressMode: 'TASKS',
      taskCount: 3,
      tasksDone: 2,
    });

    // manual progress refused once tasks exist
    await w
      .api()
      .patch(`/api/missions/${mission.id}/progress`)
      .set('Authorization', w.auth.consultant)
      .send({ progress: 90 })
      .expect(409)
      .expect((r) => expect(r.body.error).toBe('PROGRESS_COMPUTED_FROM_TASKS'));

    // reorder (lead) and ordered listing for the client
    await w
      .api()
      .patch(`/api/missions/${mission.id}/tasks/reorder`)
      .set('Authorization', w.auth.consultant)
      .send({ orderedTaskIds: [tasks[2], tasks[0], tasks[1]] })
      .expect(200);
    const clientTasks = await w
      .api()
      .get(`/api/missions/${mission.id}/tasks`)
      .set('Authorization', w.auth.client)
      .expect(200);
    expect(
      clientTasks.body.map((t: { title: string; order: number }) => [t.title, t.order]),
    ).toEqual([
      ['Rapport', 1],
      ['Collecte', 2],
      ['Analyse', 3],
    ]);

    // closing needs every task done
    await w
      .api()
      .patch(`/api/missions/${mission.id}/progress`)
      .set('Authorization', w.auth.consultant)
      .send({ status: 'TERMINÉE' })
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('TASKS_NOT_DONE'));
    await w
      .api()
      .delete(`/api/missions/${mission.id}/tasks/${tasks[2]}`)
      .set('Authorization', w.auth.consultant)
      .expect(204);
    await w
      .api()
      .patch(`/api/missions/${mission.id}/progress`)
      .set('Authorization', w.auth.consultant)
      .send({ status: 'TERMINÉE' })
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ status: 'TERMINÉE', progress: 100 }));

    const audit = await getTestPrisma().auditLog.findMany({
      where: { entity: 'Mission', entityId: mission.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => [a.action, a.fromStatus, a.toStatus])).toEqual([
      ['CREATED', null, 'EN_ATTENTE'],
      ['STATUS_CHANGED', 'EN_ATTENTE', 'EN_COURS'],
      ['STATUS_CHANGED', 'EN_COURS', 'TERMINÉE'],
    ]);
  });

  it('manual progress without tasks; client view hides consultants; lists are scoped', async () => {
    const mission = await w.activeMission();
    await w
      .api()
      .patch(`/api/missions/${mission.id}/progress`)
      .set('Authorization', w.auth.consultant2)
      .send({ progress: 40, status: 'EN_VALIDATION' })
      .expect(200)
      .expect((r) =>
        expect(r.body).toMatchObject({ progress: 40, status: 'EN_VALIDATION', isLead: false }),
      );

    const clientView = await w
      .api()
      .get(`/api/client/missions/${mission.id}`)
      .set('Authorization', w.auth.client)
      .expect(200);
    expect(clientView.body).toMatchObject({ progress: 40, title: 'Audit fiscal' });
    expect(clientView.body).not.toHaveProperty('consultants');
    await w
      .api()
      .get(`/api/client/missions/${mission.id}`)
      .set('Authorization', w.auth.client2)
      .expect(404);

    const consultantList = await w
      .api()
      .get('/api/missions?status=EN_VALIDATION&title=fisc')
      .set('Authorization', w.auth.consultant)
      .expect(200);
    expect(consultantList.body.data).toEqual([
      expect.objectContaining({ id: mission.id, isLead: true }),
    ]);
    const clientList = await w
      .api()
      .get(`/api/client/missions?contractId=${mission.contractId}`)
      .set('Authorization', w.auth.client)
      .expect(200);
    expect(clientList.body.meta.total).toBe(1);
    await w
      .api()
      .get('/api/client/missions')
      .set('Authorization', w.auth.client2)
      .expect(200)
      .expect((r) => expect(r.body.data).toEqual([]));
    const adminList = await w
      .api()
      .get('/api/admin/missions?deliveryDateFrom=2026-12-01&deliveryDateTo=2027-01-01')
      .set('Authorization', w.auth.admin)
      .expect(200);
    expect(adminList.body.meta.total).toBe(1);

    const contractFile = await w
      .api()
      .get(`/api/missions/${mission.id}/download-contract`)
      .set('Authorization', w.auth.consultant2)
      .expect(200);
    expect(contractFile.headers['content-disposition']).toContain('mission.docx');
    await w
      .api()
      .get(`/api/admin/missions/${mission.id}/download-contract`)
      .set('Authorization', w.auth.admin)
      .expect(200);
  });

  it('refusal, re-staffing and guards: unsigned contract 422, permissions 403, outsiders 404', async () => {
    const mission = await w.newMission();
    await w
      .api()
      .post(`/api/admin/missions/${mission.id}/assign`)
      .set('Authorization', w.auth.superadmin)
      .send({ consultants: [{ id: w.actors.consultant.id, isLead: true }] })
      .expect(200);
    await w
      .api()
      .post(`/api/missions/${mission.id}/respond`)
      .set('Authorization', w.auth.consultant)
      .send({ action: 'refuse' })
      .expect(200)
      .expect((r) => expect(r.body.status).toBe('REJETÉE'));
    // re-staffing a refused mission re-opens it
    await w
      .api()
      .post(`/api/admin/missions/${mission.id}/assign`)
      .set('Authorization', w.auth.superadmin)
      .send({ consultants: [{ id: w.consultant2.id }] })
      .expect(200)
      .expect((r) =>
        expect(r.body).toMatchObject({ status: 'EN_ATTENTE', leadConsultantId: w.consultant2.id }),
      );
    // the dropped consultant no longer sees it
    await w
      .api()
      .get(`/api/missions/${mission.id}`)
      .set('Authorization', w.auth.consultant)
      .expect(404);
    await w
      .api()
      .post(`/api/admin/missions/${mission.id}/assign`)
      .set('Authorization', w.auth.superadmin)
      .send({ consultants: [{ id: w.actors.client.id }] })
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('UNKNOWN_CONSULTANT'));
    await w
      .api()
      .post(`/api/admin/missions/${mission.id}/assign`)
      .set('Authorization', w.auth.admin) // bare admin
      .send({ consultants: [{ id: w.consultant2.id }] })
      .expect(403);

    // a contract that is not signed yet
    const quote = await w.validatedQuote();
    const unsigned = await w.contractFor(quote.id);
    await w
      .api()
      .post('/api/admin/missions')
      .set('Authorization', w.auth.superadmin)
      .field('contractId', unsigned.id)
      .field('title', 'Trop tôt')
      .attach('contractMission', Buffer.from('x'), 'm.pdf')
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('CONTRACT_NOT_SIGNED'));
    await w
      .api()
      .post('/api/admin/missions')
      .set('Authorization', w.auth.superadmin)
      .field('contractId', mission.contractId)
      .field('title', 'Sans fichier')
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('FILE_REQUIRED'));
    await w
      .api()
      .post('/api/admin/missions')
      .set('Authorization', w.auth.admin)
      .field('contractId', mission.contractId)
      .field('title', 'x')
      .attach('contractMission', Buffer.from('x'), 'm.pdf')
      .expect(403);

    await w.api().get('/api/missions').expect(401);
    await w.api().get('/api/missions').set('Authorization', w.auth.client).expect(403);
    await w.api().get('/api/admin/missions').set('Authorization', w.auth.consultant).expect(403);
    await w
      .api()
      .get(`/api/missions/${mission.id}/download-contract`)
      .set('Authorization', w.auth.client)
      .expect(403);
    await w
      .api()
      .patch(`/api/missions/${mission.id}/progress`)
      .set('Authorization', w.auth.consultant2)
      .send({ progress: 101 })
      .expect(400);
  });
});
