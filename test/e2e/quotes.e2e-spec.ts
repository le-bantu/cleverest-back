import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../utils/http-app';
import { getTestPrisma } from '../utils/test-db';
import { ACTOR_PASSWORD, seedActors, SeededActors } from '../fixtures/actors';
import { createUser, SeededUser } from '../fixtures/quotes';

const api = (app: INestApplication) => request(app.getHttpServer());

describe('quotes (e2e)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;
  let actors: SeededActors;
  let consultant2: SeededUser;
  const auth: Record<string, string> = {};

  const login = async (email: string, password = ACTOR_PASSWORD): Promise<string> => {
    const res = await api(app).post('/api/auth/login').send({ email, password }).expect(200);
    return `Bearer ${res.body.accessToken as string}`;
  };

  beforeAll(async () => {
    ({ app, close } = await createTestApp());
  });
  afterAll(() => close());
  beforeEach(async () => {
    const db = getTestPrisma();
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "users","roles","permissions","audit_logs","notifications","quotes" RESTART IDENTITY CASCADE;',
    );
    actors = await seedActors(db);
    // second consultant shares the actors' password hash for login
    const hash = (await db.user.findUniqueOrThrow({ where: { id: actors.consultant.id } }))
      .passwordHash;
    consultant2 = await createUser(db, 'consultant2@e2e.test', 'consultant', {
      firstName: 'Fiona',
      lastName: 'Fisc',
      expertiseDomains: ['fiscal'],
      validated: true,
    });
    await db.user.update({ where: { id: consultant2.id }, data: { passwordHash: hash } });

    auth.client = await login(actors.client.email);
    auth.consultant = await login(actors.consultant.email);
    auth.consultant2 = await login(consultant2.email);
    auth.superadmin = await login(actors.superadmin.email);
    auth.admin = await login(actors.admin.email);
  });

  const createQuote = async (description = 'Audit fiscal de la holding') => {
    const res = await api(app)
      .post('/api/quotes')
      .set('Authorization', auth.client)
      .send({ type: 'CONSULTATION', title: 'Audit', description })
      .expect(201);
    return res.body as { id: string; requestNumber: string; status: string };
  };

  it('full workflow: client creates → admin assigns (lead) → consultant quotes → admin validates → client signs', async () => {
    const quote = await createQuote();
    expect(quote).toMatchObject({ status: 'EN_ATTENTE', requestNumber: 'req-001' });

    const assigned = await api(app)
      .post(`/api/admin/quotes/${quote.id}/assign-consultants`)
      .set('Authorization', auth.superadmin)
      .send({ consultants: [{ id: actors.consultant.id, isLead: true }, { id: consultant2.id }] })
      .expect(200);
    expect(assigned.body).toMatchObject({
      status: 'TRAITEMENT_CONSULTANT',
      leadConsultantId: actors.consultant.id,
    });
    expect(assigned.body.consultants).toEqual(
      expect.arrayContaining([
        { consultantId: actors.consultant.id, isLead: true },
        { consultantId: consultant2.id, isLead: false },
      ]),
    );

    // consultant sees it in their list, with isLead exposed
    const mine = await api(app)
      .get('/api/consultant/quotes')
      .set('Authorization', auth.consultant)
      .expect(200);
    expect(mine.body.data).toEqual([expect.objectContaining({ id: quote.id, isLead: true })]);

    // illegal transition from the client side → 409
    await api(app)
      .patch(`/api/quotes/${quote.id}/sign`)
      .set('Authorization', auth.client)
      .send({ action: 'sign' })
      .expect(409)
      .expect((r) => expect(r.body.error).toBe('QUOTE_TRANSITION_NOT_ALLOWED'));

    await api(app)
      .patch(`/api/consultant/quotes/${quote.id}/submit`)
      .set('Authorization', auth.consultant)
      .send({ price: 2500, consultantNotes: '5 jours' })
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ status: 'COTÉ', price: 2500 }));

    // client does not see the price before validation, nor internal notes
    const beforeValidation = await api(app)
      .get(`/api/quotes/${quote.id}`)
      .set('Authorization', auth.client)
      .expect(200);
    expect(beforeValidation.body.price).toBeNull();
    expect(beforeValidation.body).not.toHaveProperty('consultantNotes');

    await api(app)
      .patch(`/api/admin/quotes/${quote.id}/validate`)
      .set('Authorization', auth.superadmin)
      .send({ status: 'VALIDÉ_ADMIN', adminNotes: 'ok' })
      .expect(200)
      .expect((r) => expect(r.body.status).toBe('VALIDÉ_ADMIN'));

    await api(app)
      .patch(`/api/quotes/${quote.id}/sign`)
      .set('Authorization', auth.client)
      .send({ action: 'sign' })
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ status: 'SIGNÉ_CLIENT', price: 2500 }));

    // every status change wrote an AuditLog row
    const audit = await getTestPrisma().auditLog.findMany({
      where: { entity: 'Quote', entityId: quote.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => [a.action, a.fromStatus, a.toStatus])).toEqual([
      ['CREATED', null, 'EN_ATTENTE'],
      ['STATUS_CHANGED', 'EN_ATTENTE', 'TRAITEMENT_CONSULTANT'],
      ['STATUS_CHANGED', 'TRAITEMENT_CONSULTANT', 'COTÉ'],
      ['STATUS_CHANGED', 'COTÉ', 'VALIDÉ_ADMIN'],
      ['STATUS_CHANGED', 'VALIDÉ_ADMIN', 'SIGNÉ_CLIENT'],
    ]);

    // the client got notified when the quote became ready
    expect(
      await getTestPrisma().notification.count({ where: { userId: actors.client.id } }),
    ).toBeGreaterThan(0);

    // terminal: any further transition is refused
    await api(app)
      .patch(`/api/admin/quotes/${quote.id}/review`)
      .set('Authorization', auth.superadmin)
      .send({ status: 'REJETÉ' })
      .expect(409);
  });

  it('admin review can reject without a price', async () => {
    const quote = await createQuote();
    await api(app)
      .patch(`/api/admin/quotes/${quote.id}/review`)
      .set('Authorization', auth.superadmin)
      .send({ status: 'REJETÉ', rejectedReason: 'Hors périmètre' })
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ status: 'REJETÉ', price: null }));
  });

  it('consultant cannot submit past the deadline (422 DEADLINE_EXCEEDED)', async () => {
    const quote = await createQuote();
    await api(app)
      .post(`/api/admin/quotes/${quote.id}/assign-consultants`)
      .set('Authorization', auth.superadmin)
      .send({ consultants: [{ id: actors.consultant.id, isLead: true }] })
      .expect(200);
    await getTestPrisma().quote.update({
      where: { id: quote.id },
      data: { consultantDeadline: new Date(Date.now() - 60_000) },
    });
    await api(app)
      .patch(`/api/consultant/quotes/${quote.id}/submit`)
      .set('Authorization', auth.consultant)
      .send({ price: 100 })
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('DEADLINE_EXCEEDED'));
  });

  it('split into 2 subquotes, then list them; a subquote cannot be split again', async () => {
    const quote = await createQuote();
    const split = await api(app)
      .post(`/api/admin/quotes/${quote.id}/split`)
      .set('Authorization', auth.superadmin)
      .send({ consultants: [actors.consultant.id, consultant2.id] })
      .expect(201);
    expect(split.body.status).toBe('TRAITEMENT_CONSULTANT');
    expect(split.body.subquotes).toHaveLength(2);
    expect(split.body.subquotes.map((s: { requestNumber: string }) => s.requestNumber)).toEqual([
      'req-002',
      'req-003',
    ]);

    const subs = await api(app)
      .get(`/api/admin/quotes/${quote.id}/subquotes`)
      .set('Authorization', auth.superadmin)
      .expect(200);
    expect(subs.body).toHaveLength(2);
    expect(subs.body[0]).toMatchObject({
      isSubquote: true,
      parentQuoteId: quote.id,
      documents: [],
    });

    await api(app)
      .post(`/api/admin/quotes/${subs.body[0].id as string}/split`)
      .set('Authorization', auth.superadmin)
      .send({ consultants: [consultant2.id] })
      .expect(409)
      .expect((r) => expect(r.body.error).toBe('SUBQUOTE_OF_SUBQUOTE'));

    // client only sees the main quote
    const list = await api(app).get('/api/quotes').set('Authorization', auth.client).expect(200);
    expect(list.body.data.map((q: { id: string }) => q.id)).toEqual([quote.id]);

    // manual subquote
    await api(app)
      .post(`/api/admin/quotes/${quote.id}/subquotes`)
      .set('Authorization', auth.superadmin)
      .send({ title: 'Volet social', description: 'Partie sociale', consultantId: consultant2.id })
      .expect(201)
      .expect((r) =>
        expect(r.body).toMatchObject({ isSubquote: true, leadConsultantId: consultant2.id }),
      );
  });

  it('GET shortlist returns a sorted list without side effect', async () => {
    const quote = await createQuote('Optimisation fiscal et social');
    const auditBefore = await getTestPrisma().auditLog.count();
    const res = await api(app)
      .get(`/api/admin/quotes/${quote.id}/shortlist`)
      .set('Authorization', auth.superadmin)
      .expect(200);
    expect(res.body[0]).toMatchObject({
      consultantId: consultant2.id,
      name: 'Fiona Fisc',
      expertiseMatch: ['fiscal'],
      validated: true,
    });
    const scores = (res.body as Array<{ score: number }>).map((e) => e.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    const after = await getTestPrisma().quote.findUniqueOrThrow({
      where: { id: quote.id },
      include: { consultants: true },
    });
    expect(after.consultants).toHaveLength(0);
    expect(after.status).toBe('EN_ATTENTE');
    expect(await getTestPrisma().auditLog.count()).toBe(auditBefore);
  });

  it('documents: upload + visibility (client does not see an ADMIN doc), download, delete', async () => {
    const quote = await createQuote();
    await api(app)
      .post(`/api/admin/quotes/${quote.id}/assign-consultants`)
      .set('Authorization', auth.superadmin)
      .send({ consultants: [{ id: actors.consultant.id, isLead: true }] })
      .expect(200);

    const adminDoc = await api(app)
      .post(`/api/admin/quotes/${quote.id}/documents`)
      .set('Authorization', auth.superadmin)
      .field('label', 'Note interne')
      .field('visibility', 'ADMIN')
      .attach('file', Buffer.from('internal'), 'interne.pdf')
      .expect(201);
    const sharedDoc = await api(app)
      .post(`/api/admin/quotes/${quote.id}/documents`)
      .set('Authorization', auth.superadmin)
      .field('visibility', 'SPECIFIC')
      .field('visibleUsers', actors.client.id)
      .attach('file', Buffer.from('shared'), 'partage.pdf')
      .expect(201);
    expect(sharedDoc.body).toMatchObject({
      visibleTo: 'SPECIFIC',
      visibleUsers: [actors.client.id],
    });

    const clientDoc = await api(app)
      .post(`/api/quotes/${quote.id}/documents`)
      .set('Authorization', auth.client)
      .attach('file', Buffer.from('brief'), 'brief.pdf')
      .expect(201);
    expect(clientDoc.body).toMatchObject({ uploadedByRole: 'CLIENT', visibleTo: 'CLIENT' });

    const clientList = await api(app)
      .get(`/api/quotes/${quote.id}/documents`)
      .set('Authorization', auth.client)
      .expect(200);
    const clientIds = clientList.body.map((d: { id: string }) => d.id).sort();
    expect(clientIds).toEqual([sharedDoc.body.id, clientDoc.body.id].sort());

    const consultantList = await api(app)
      .get(`/api/consultant/quotes/${quote.id}/documents`)
      .set('Authorization', auth.consultant)
      .expect(200);
    expect(consultantList.body).toEqual([]);

    await api(app)
      .get(`/api/quotes/${quote.id}/documents/${adminDoc.body.id as string}/download`)
      .set('Authorization', auth.client)
      .expect(404);
    const dl = await api(app)
      .get(`/api/quotes/${quote.id}/documents/${sharedDoc.body.id as string}/download`)
      .set('Authorization', auth.client)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((dl.body as Buffer).toString()).toBe('shared');
    expect(dl.headers['content-disposition']).toContain('partage.pdf');

    // admin opens the internal note to everyone → consultant now sees it
    await api(app)
      .patch(`/api/admin/quotes/documents/${adminDoc.body.id as string}/visibility`)
      .set('Authorization', auth.superadmin)
      .send({ visibleTo: 'ALL' })
      .expect(200);
    const after = await api(app)
      .get(`/api/consultant/quotes/${quote.id}/documents`)
      .set('Authorization', auth.consultant)
      .expect(200);
    expect(after.body.map((d: { id: string }) => d.id)).toEqual([adminDoc.body.id]);

    // only uploader/admin can delete
    await api(app)
      .delete(`/api/consultant/quotes/${quote.id}/documents/${adminDoc.body.id as string}`)
      .set('Authorization', auth.consultant)
      .expect(403);
    await api(app)
      .delete(`/api/quotes/${quote.id}/documents/${clientDoc.body.id as string}`)
      .set('Authorization', auth.client)
      .expect(204);

    // outsider consultant cannot reach the quote documents
    await api(app)
      .get(`/api/consultant/quotes/${quote.id}/documents`)
      .set('Authorization', auth.consultant2)
      .expect(404);
  });

  it('client can delete only a pending quote', async () => {
    const quote = await createQuote();
    const other = await createQuote();
    await api(app)
      .patch(`/api/admin/quotes/${other.id}/review`)
      .set('Authorization', auth.superadmin)
      .send({ status: 'REJETÉ' })
      .expect(200);
    await api(app).delete(`/api/quotes/${other.id}`).set('Authorization', auth.client).expect(409);
    await api(app).delete(`/api/quotes/${quote.id}`).set('Authorization', auth.client).expect(204);
    await api(app).get(`/api/quotes/${quote.id}`).set('Authorization', auth.client).expect(404);
  });

  it('authorization and validation: 401 / 403 / 400', async () => {
    const quote = await createQuote();
    await api(app).get('/api/quotes').expect(401);
    // bare admin lacks manage-quotes / assign-consultants
    await api(app).get('/api/admin/quotes').set('Authorization', auth.admin).expect(403);
    await api(app)
      .get(`/api/admin/quotes/${quote.id}/shortlist`)
      .set('Authorization', auth.admin)
      .expect(403);
    // wrong roles on audience-specific routes
    await api(app).get('/api/consultant/quotes').set('Authorization', auth.client).expect(403);
    await api(app)
      .post('/api/quotes')
      .set('Authorization', auth.consultant)
      .send({ type: 'CONSULTATION', description: 'x' })
      .expect(403);
    // a consultant not assigned cannot see the quote
    await api(app)
      .get(`/api/consultant/quotes/${quote.id}`)
      .set('Authorization', auth.consultant)
      .expect(404);
    // input validation
    await api(app)
      .post('/api/quotes')
      .set('Authorization', auth.client)
      .send({ type: 'ponctuel', description: 'x' })
      .expect(400);
    await api(app)
      .post('/api/quotes')
      .set('Authorization', auth.client)
      .send({ type: 'CONSULTATION' })
      .expect(400);
    await api(app).get('/api/quotes/not-a-uuid').set('Authorization', auth.client).expect(400);
    await api(app)
      .post(`/api/admin/quotes/${quote.id}/assign-consultants`)
      .set('Authorization', auth.superadmin)
      .send({
        consultants: [
          { id: actors.consultant.id, isLead: true },
          { id: consultant2.id, isLead: true },
        ],
      })
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('MULTIPLE_LEADS'));
    await api(app)
      .post(`/api/admin/quotes/${quote.id}/assign-consultants`)
      .set('Authorization', auth.superadmin)
      .send({ consultants: [{ id: actors.client.id }] })
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('UNKNOWN_CONSULTANT'));

    // admin list with filters
    const list = await api(app)
      .get('/api/admin/quotes?status=EN_ATTENTE&isSubquote=false&perPage=5')
      .set('Authorization', auth.superadmin)
      .expect(200);
    expect(list.body.meta).toMatchObject({ total: 1, perPage: 5 });
  });
});
