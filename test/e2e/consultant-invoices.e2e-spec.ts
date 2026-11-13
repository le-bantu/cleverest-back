import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../utils/http-app';
import { getTestPrisma } from '../utils/test-db';
import { LifecycleWorld, PDF } from '../fixtures/lifecycle';

describe('consultant invoices (e2e)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;
  let w: LifecycleWorld;

  beforeAll(async () => {
    ({ app, close } = await createTestApp());
    w = new LifecycleWorld(app);
  });
  afterAll(() => close());
  beforeEach(() => w.reset());

  const submit = (missionId: string, auth: string, amount?: number, name = 'facture.pdf') => {
    const req = w
      .api()
      .post('/api/consultant/invoices')
      .set('Authorization', auth)
      .field('missionId', missionId);
    if (amount !== undefined) req.field('amount', String(amount));
    return req.attach('file', PDF('facture'), name);
  };

  it('consultant invoices within the signed contract → admin with pay-consultants marks it paid', async () => {
    const mission = await w.activeMission(); // each consultant signed a 400 € contract
    const first = await submit(mission.id, w.auth.consultant2, 150).expect(201);
    expect(first.body).toMatchObject({
      consultantId: w.consultant2.id,
      missionId: mission.id,
      quoteId: mission.quoteId,
      amount: 150,
      isPaid: false,
      fileName: 'facture.pdf',
    });
    await submit(mission.id, w.auth.consultant2, 300)
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('INVOICE_EXCEEDS_CONTRACT'));
    const rest = await submit(mission.id, w.auth.consultant2).expect(201);
    expect(rest.body.amount).toBe(250);
    await submit(mission.id, w.auth.consultant2)
      .expect(409)
      .expect((r) => expect(r.body.error).toBe('CONTRACT_FULLY_INVOICED'));

    const id = first.body.id as string;
    await w
      .api()
      .patch(`/api/admin/invoices/${id}/pay`)
      .set('Authorization', w.auth.admin)
      .expect(403);
    const paid = await w
      .api()
      .patch(`/api/admin/invoices/${id}/pay`)
      .set('Authorization', w.auth.superadmin)
      .expect(200);
    expect(paid.body).toMatchObject({ isPaid: true });
    expect(paid.body.paidAt).not.toBeNull();
    await w
      .api()
      .patch(`/api/admin/invoices/${id}/pay`)
      .set('Authorization', w.auth.superadmin)
      .expect(409);

    const db = getTestPrisma();
    expect(
      await db.notification.count({
        where: { userId: w.consultant2.id, type: 'consultant-invoice' },
      }),
    ).toBe(1);
    expect(await db.auditLog.count({ where: { entity: 'ConsultantInvoice', entityId: id } })).toBe(
      2,
    );
  });

  it('no invoice without a signed consultant contract (403)', async () => {
    const mission = await w.activeMission({ engaged: false });
    await submit(mission.id, w.auth.consultant, 10)
      .expect(403)
      .expect((r) => expect(r.body.error).toBe('CONSULTANT_CONTRACT_NOT_SIGNED'));
  });

  it('lists per audience; downloads by author or admin; guards', async () => {
    const mission = await w.activeMission();
    const a = (await submit(mission.id, w.auth.consultant, 100).expect(201)).body.id as string;
    const b = (await submit(mission.id, w.auth.consultant2, 200, 'f.png').expect(201)).body
      .id as string;
    await w
      .api()
      .patch(`/api/admin/invoices/${b}/pay`)
      .set('Authorization', w.auth.superadmin)
      .expect(200);

    const ids = async (path: string, auth: string) =>
      (await w.api().get(path).set('Authorization', auth).expect(200)).body.data
        .map((i: { id: string }) => i.id)
        .sort();
    expect(await ids('/api/consultant/invoices', w.auth.consultant)).toEqual([a]);
    expect(await ids('/api/admin/invoices', w.auth.admin)).toEqual([a, b].sort());
    expect(await ids(`/api/admin/invoices?consultantId=${w.consultant2.id}`, w.auth.admin)).toEqual(
      [b],
    );
    expect(await ids('/api/admin/invoices?isPaid=false', w.auth.admin)).toEqual([a]);
    expect(
      await ids(
        `/api/admin/invoices?missionId=${mission.id}&uploadedFrom=2099-01-01`,
        w.auth.admin,
      ),
    ).toEqual([]);

    await w
      .api()
      .get(`/api/consultant/invoices/${a}/download`)
      .set('Authorization', w.auth.consultant)
      .expect(200)
      .expect('content-type', /pdf/);
    await w
      .api()
      .get(`/api/consultant/invoices/${a}/download`)
      .set('Authorization', w.auth.consultant2)
      .expect(404);
    await w
      .api()
      .get(`/api/admin/invoices/${a}/download`)
      .set('Authorization', w.auth.admin)
      .expect(200);

    await submit(mission.id, w.auth.client, 10).expect(403);
    await submit(mission.id, w.auth.consultant, 10, 'f.docx')
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('FILE_TYPE_NOT_ALLOWED'));
    const outsider = await w.newMission('Autre');
    await submit(outsider.id, w.auth.consultant, 10).expect(404);
    await w.api().get('/api/admin/invoices').set('Authorization', w.auth.consultant).expect(403);
  });
});
