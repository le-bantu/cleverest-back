import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../utils/http-app';
import { getTestPrisma } from '../utils/test-db';
import { LifecycleWorld, PDF } from '../fixtures/lifecycle';

/**
 * The critical path, end to end, through HTTP only (DoD lot 8):
 * sign-up → quote → contract → mission → tasks → deliverable → payment → invoice → review.
 */
describe('critical journey (e2e)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;
  let w: LifecycleWorld;

  beforeAll(async () => {
    ({ app, close } = await createTestApp());
    w = new LifecycleWorld(app);
  });
  afterAll(() => close());
  beforeEach(() => w.reset());

  it('a new client goes from sign-up to reviewing a completed mission', async () => {
    const api = () => w.api();
    const lead = w.auth.consultant;
    const member = w.auth.consultant2;
    const admin = w.auth.superadmin;

    // 1. sign-up + login
    const email = 'nouveau.client@e2e.test';
    const password = 'Sup3rSecret!';
    const signup = await api()
      .post('/api/auth/register')
      .send({ email, password, role: 'client' })
      .expect(201);
    const clientId = signup.body.userId as string;
    const login = await api().post('/api/auth/login').send({ email, password }).expect(200);
    const client = `Bearer ${login.body.accessToken as string}`;

    // 2. quote: request → team (lead + member) → priced by the lead → validated by the admin
    const quote = await api()
      .post('/api/quotes')
      .set('Authorization', client)
      .send({ type: 'CONSULTATION', title: 'Audit', description: 'Audit fiscal annuel' })
      .expect(201);
    const quoteId = quote.body.id as string;
    await api()
      .post(`/api/admin/quotes/${quoteId}/assign-consultants`)
      .set('Authorization', admin)
      .send({
        consultants: [{ id: w.actors.consultant.id, isLead: true }, { id: w.consultant2.id }],
      })
      .expect(200);
    await api()
      .patch(`/api/consultant/quotes/${quoteId}/submit`)
      .set('Authorization', lead)
      .send({ price: 3000 })
      .expect(200);
    await api()
      .patch(`/api/admin/quotes/${quoteId}/validate`)
      .set('Authorization', admin)
      .send({ status: 'VALIDÉ_ADMIN' })
      .expect(200);

    // 3. client contract drawn up by the admin, signed by the client
    const contract = await api()
      .post('/api/admin/contracts')
      .set('Authorization', admin)
      .field('quoteId', quoteId)
      .attach('file', PDF('contrat'), 'contrat.pdf')
      .expect(201);
    const contractId = contract.body.id as string;
    await api()
      .patch(`/api/contracts/${contractId}`)
      .set('Authorization', client)
      .attach('file', PDF('contrat signé'), 'contrat-signe.pdf')
      .expect(200);
    await api()
      .get(`/api/quotes/${quoteId}`)
      .set('Authorization', client)
      .expect(200)
      .expect((r) => expect(r.body.status).toBe('SIGNÉ_CLIENT'));

    // 4. each consultant signs their engagement with The Cleverest
    for (const [consultantId, auth] of [
      [w.actors.consultant.id, lead],
      [w.consultant2.id, member],
    ]) {
      const engagement = await api()
        .post('/api/admin/consultant-contracts')
        .set('Authorization', admin)
        .field('quoteId', quoteId)
        .field('consultantId', consultantId)
        .field('amount', '1200')
        .attach('file', PDF('engagement'), 'engagement.pdf')
        .expect(201);
      await api()
        .patch(`/api/consultant/contracts/${engagement.body.id as string}`)
        .set('Authorization', auth)
        .attach('file', PDF('engagement signé'), 'engagement-signe.pdf')
        .expect(200);
    }

    // 5. mission opened on the signed contract, staffed, accepted by the lead
    const mission = await api()
      .post('/api/admin/missions')
      .set('Authorization', admin)
      .field('contractId', contractId)
      .field('title', 'Audit fiscal 2026')
      .attach('contractMission', Buffer.from('mission'), 'mission.docx')
      .expect(201);
    const missionId = mission.body.id as string;
    await api()
      .post(`/api/admin/missions/${missionId}/assign`)
      .set('Authorization', admin)
      .send({ consultants: [{ id: w.actors.consultant.id }, { id: w.consultant2.id }] })
      .expect(200);
    await api()
      .post(`/api/missions/${missionId}/respond`)
      .set('Authorization', lead)
      .send({ action: 'accept' })
      .expect(200)
      .expect((r) => expect(r.body.status).toBe('EN_COURS'));

    // 6. tasks: the lead plans, the member delivers
    const task = await api()
      .post(`/api/missions/${missionId}/tasks`)
      .set('Authorization', lead)
      .send({ title: 'Analyse des comptes', assigneeConsultantId: w.consultant2.id })
      .expect(201);
    await api()
      .patch(`/api/missions/${missionId}/tasks/${task.body.id as string}`)
      .set('Authorization', member)
      .send({ status: 'FAITE' })
      .expect(200);

    // 7. deliverable: uploaded, released by the admin, accepted by the client
    const deliverable = await api()
      .post('/api/consultant/deliverables')
      .set('Authorization', member)
      .field('missionId', missionId)
      .attach('file', PDF('rapport'), 'rapport.pdf')
      .expect(201);
    const deliverableId = deliverable.body.id as string;
    await api()
      .patch(`/api/admin/deliverables/${deliverableId}/validate`)
      .set('Authorization', admin)
      .expect(200);
    await api()
      .get(`/api/client/deliverables/${deliverableId}/download`)
      .set('Authorization', client)
      .expect(200);
    await api()
      .patch(`/api/client/deliverables/${deliverableId}/validate`)
      .set('Authorization', client)
      .expect(200)
      .expect((r) => expect(r.body.clientValidated).toBe(true));

    // 8. payment declared by the client, validated, invoiced, downloaded
    const payment = await api()
      .post('/api/payments')
      .set('Authorization', client)
      .field('missionId', missionId)
      .field('amount', '3000')
      .attach('file', PDF('virement'), 'virement.pdf')
      .expect(201);
    const paymentId = payment.body.id as string;
    await api()
      .patch(`/api/admin/payments/${paymentId}/validate`)
      .set('Authorization', admin)
      .expect(200);
    const invoice = await api()
      .post(`/api/admin/payments/${paymentId}/invoice`)
      .set('Authorization', admin)
      .expect(201);
    expect(invoice.body).toMatchObject({ clientId, amount: 3000 });
    const pdf = await api()
      .get(`/api/client/invoices/${invoice.body.id as string}/download`)
      .set('Authorization', client)
      .buffer(true)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');

    // 9. the lead closes the mission, the client reviews it
    await api()
      .patch(`/api/missions/${missionId}/progress`)
      .set('Authorization', lead)
      .send({ status: 'TERMINÉE' })
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ status: 'TERMINÉE', progress: 100 }));
    const review = await api()
      .post('/api/reviews')
      .set('Authorization', client)
      .send({ missionId, rating: 5, comment: 'Équipe réactive et rigoureuse' })
      .expect(201);
    await api()
      .get('/api/admin/reviews')
      .set('Authorization', admin)
      .expect(200)
      .expect((r) =>
        expect(r.body.data).toEqual([
          expect.objectContaining({
            id: review.body.id,
            rating: 5,
            client: expect.objectContaining({ email }),
          }),
        ]),
      );

    // the dashboard reflects the whole journey
    const summary = await api()
      .get('/api/admin/dashboard/summary')
      .set('Authorization', admin)
      .expect(200);
    expect(summary.body).toMatchObject({
      quotes: { byStatus: { SIGNÉ_CLIENT: 1 } },
      missions: { completed: 1 },
      payments: { validated: { count: 1, amount: 3000 } },
      reviews: { count: 1, averageRating: 5 },
    });

    // and every step left an audit trail
    const audited = await getTestPrisma().auditLog.groupBy({ by: ['entity'] });
    expect(audited.map((a) => a.entity).sort()).toEqual(
      expect.arrayContaining([
        'Quote',
        'Contract',
        'Mission',
        'Deliverable',
        'Payment',
        'MissionReview',
      ]),
    );
  });
});
