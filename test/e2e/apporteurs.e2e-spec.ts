import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../utils/http-app';
import { getTestPrisma } from '../utils/test-db';
import { LifecycleWorld, PDF } from '../fixtures/lifecycle';
import { MailNotifierAdapter } from '../../src/shared/infrastructure/notifications/mail-notifier.adapter';

describe('apporteurs: prospects & commissions (e2e)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;
  let w: LifecycleWorld;

  beforeAll(async () => {
    ({ app, close } = await createTestApp());
    w = new LifecycleWorld(app);
  });
  afterAll(() => close());
  beforeEach(() => w.reset());

  const declare = async (auth = w.auth.apporteur, email = 'jean@acme.test') =>
    (
      await w
        .api()
        .post('/api/prospects')
        .set('Authorization', auth)
        .send({
          name: 'Jean Dupont',
          company: 'ACME SAS',
          contactEmail: email,
          contactPhone: '0600',
        })
        .expect(201)
    ).body as { id: string };

  const convert = (id: string, auth = w.auth.superadmin, fields: Record<string, string> = {}) => {
    const req = w.api().post(`/api/admin/prospects/${id}/convert`).set('Authorization', auth);
    const all = {
      quoteTitle: 'Audit fiscal',
      missionTitle: 'Mission audit',
      price: '5000',
      ...fields,
    };
    for (const [k, v] of Object.entries(all)) req.field(k, v);
    return req
      .attach('signedContract', PDF('contrat signé'), 'contrat-signe.pdf')
      .attach('contractMission', PDF('mission'), 'mission.pdf');
  };

  it('apporteur declares → admin converts → client + signed deal + mission + commission exist → commission paid', async () => {
    const prospect = await declare();
    await w
      .api()
      .post(`/api/prospects/${prospect.id}/upload`)
      .set('Authorization', w.auth.apporteur)
      .attach('file', PDF('kbis'), 'kbis.pdf')
      .expect(200)
      .expect((r) => expect(r.body.documentName).toBe('kbis.pdf'));
    await w
      .api()
      .get(`/api/admin/prospects/${prospect.id}/document`)
      .set('Authorization', w.auth.admin)
      .expect(200);
    const pending = await w
      .api()
      .get('/api/admin/prospects?status=EN_ATTENTE')
      .set('Authorization', w.auth.admin)
      .expect(200);
    expect(pending.body.data.map((p: { id: string }) => p.id)).toEqual([prospect.id]);

    const mail = app.get(MailNotifierAdapter);
    mail.sent.length = 0;
    const res = await convert(prospect.id, w.auth.superadmin, { commissionAmount: '300' }).expect(
      201,
    );
    expect(res.body).toMatchObject({
      clientCreated: true,
      prospect: { status: 'CONVERTI' },
    });
    const { clientId, quoteId, contractId, missionId, commissionId } = res.body as Record<
      string,
      string
    >;

    // the new client receives credentials by email and can log in
    const welcome = mail.sent.find((m) => m.to === 'jean@acme.test')!;
    const password = /Mot de passe temporaire : (\S+)/.exec(welcome.text)![1];
    const login = await w
      .api()
      .post('/api/auth/login')
      .send({ email: 'jean@acme.test', password })
      .expect(200);
    const clientAuth = `Bearer ${login.body.accessToken as string}`;
    const contracts = await w
      .api()
      .get('/api/contracts')
      .set('Authorization', clientAuth)
      .expect(200);
    expect(contracts.body.data).toEqual([
      expect.objectContaining({ id: contractId, quoteId, clientId, signed: true }),
    ]);
    const missions = await w
      .api()
      .get('/api/client/missions')
      .set('Authorization', clientAuth)
      .expect(200);
    expect(missions.body.data.map((m: { id: string }) => m.id)).toEqual([missionId]);
    const quote = await getTestPrisma().quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(quote.status).toBe('SIGNE_CLIENT');

    // the apporteur sees the outcome and the commission
    const mine = await w
      .api()
      .get('/api/commissions')
      .set('Authorization', w.auth.apporteur)
      .expect(200);
    expect(mine.body.data).toEqual([
      expect.objectContaining({
        id: commissionId,
        clientName: 'ACME SAS',
        missionTitle: 'Mission audit',
        amount: 300,
        status: 'EN_ATTENTE',
      }),
    ]);

    await w
      .api()
      .patch(`/api/admin/commissions/${commissionId}/status`)
      .set('Authorization', w.auth.admin)
      .send({ status: 'VALIDÉE' })
      .expect(403); // no pay-apporteurs
    await w
      .api()
      .patch(`/api/admin/commissions/${commissionId}`)
      .set('Authorization', w.auth.superadmin)
      .send({ amount: 350 })
      .expect(200);
    for (const status of ['VALIDÉE', 'PAYÉE']) {
      await w
        .api()
        .patch(`/api/admin/commissions/${commissionId}/status`)
        .set('Authorization', w.auth.superadmin)
        .send({ status })
        .expect(200);
    }
    await w
      .api()
      .patch(`/api/admin/commissions/${commissionId}`)
      .set('Authorization', w.auth.superadmin)
      .send({ amount: 1 })
      .expect(409)
      .expect((r) => expect(r.body.error).toBe('COMMISSION_LOCKED'));
    const paid = await w
      .api()
      .get(`/api/commissions/${commissionId}`)
      .set('Authorization', w.auth.apporteur)
      .expect(200);
    expect(paid.body).toMatchObject({ status: 'PAYÉE', amount: 350 });

    const types = (
      await getTestPrisma().notification.findMany({
        where: { userId: w.apporteur.id },
        orderBy: { createdAt: 'asc' },
      })
    ).map((n) => n.type);
    expect(types).toEqual(['prospect', 'commission', 'commission']);

    // not re-entrant
    await convert(prospect.id)
      .expect(409)
      .expect((r) => expect(r.body.error).toBe('PROSPECT_ALREADY_PROCESSED'));
  });

  it('ownership: an apporteur only sees their own prospects and commissions', async () => {
    const mine = await declare();
    const theirs = await declare(w.auth.apporteur2, 'other@acme.test');
    const converted = (await convert(theirs.id).expect(201)).body as { commissionId: string };

    const ids = async (path: string, auth: string) =>
      (await w.api().get(path).set('Authorization', auth).expect(200)).body.data.map(
        (x: { id: string }) => x.id,
      );
    expect(await ids('/api/prospects', w.auth.apporteur)).toEqual([mine.id]);
    expect(await ids('/api/prospects', w.auth.apporteur2)).toEqual([theirs.id]);
    expect(await ids('/api/commissions', w.auth.apporteur)).toEqual([]);
    expect(await ids('/api/commissions', w.auth.apporteur2)).toEqual([converted.commissionId]);

    await w
      .api()
      .get(`/api/prospects/${theirs.id}`)
      .set('Authorization', w.auth.apporteur)
      .expect(404);
    await w
      .api()
      .post(`/api/prospects/${theirs.id}/upload`)
      .set('Authorization', w.auth.apporteur)
      .attach('file', PDF('x'), 'x.pdf')
      .expect(404);
    await w
      .api()
      .get(`/api/commissions/${converted.commissionId}`)
      .set('Authorization', w.auth.apporteur)
      .expect(404);
    await w
      .api()
      .get(`/api/commissions/${converted.commissionId}`)
      .set('Authorization', w.auth.admin)
      .expect(200);
    expect(
      await ids(`/api/admin/commissions?apporteurId=${w.apporteur2.id}`, w.auth.admin),
    ).toEqual([converted.commissionId]);
    expect(await ids(`/api/admin/prospects?apporteurId=${w.apporteur.id}`, w.auth.admin)).toEqual([
      mine.id,
    ]);
  });

  it('guards: roles, permissions, missing files, reject then convert, email of a non-client', async () => {
    const p = await declare();
    await w
      .api()
      .post('/api/prospects')
      .set('Authorization', w.auth.client)
      .send({ name: 'x' })
      .expect(403);
    await w.api().get('/api/admin/prospects').set('Authorization', w.auth.apporteur).expect(403);
    await w
      .api()
      .post('/api/prospects')
      .set('Authorization', w.auth.apporteur)
      .send({ name: 'x', contactEmail: 'nope' })
      .expect(400);
    await convert(p.id, w.auth.admin).expect(403); // no manage-users
    await w
      .api()
      .post(`/api/admin/prospects/${p.id}/convert`)
      .set('Authorization', w.auth.superadmin)
      .field('quoteTitle', 'A')
      .field('missionTitle', 'M')
      .field('price', '10')
      .attach('signedContract', PDF('c'), 'c.pdf')
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('FILE_REQUIRED'));
    await convert(p.id, w.auth.superadmin, { price: '-1' }).expect(400);

    // the prospect's email belongs to a consultant account → 409, nothing created
    const clash = await declare(w.auth.apporteur, w.actors.consultant.email);
    await convert(clash.id)
      .expect(409)
      .expect((r) => expect(r.body.error).toBe('EMAIL_USED_BY_NON_CLIENT'));
    expect(await getTestPrisma().quote.count()).toBe(0);

    await w
      .api()
      .patch(`/api/admin/prospects/${p.id}/reject`)
      .set('Authorization', w.auth.superadmin)
      .send({ reason: 'hors cible' })
      .expect(200)
      .expect((r) =>
        expect(r.body).toMatchObject({ status: 'REJETÉ', rejectedReason: 'hors cible' }),
      );
    await convert(p.id).expect(409);
  });
});
