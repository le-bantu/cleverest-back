import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../utils/http-app';
import { getTestPrisma } from '../utils/test-db';
import { LifecycleWorld, PDF } from '../fixtures/lifecycle';

describe('payments & client invoices (e2e)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;
  let w: LifecycleWorld;

  beforeAll(async () => {
    ({ app, close } = await createTestApp());
    w = new LifecycleWorld(app);
  });
  afterAll(() => close());
  beforeEach(() => w.reset());

  const binary = (
    res: { on: (e: string, cb: (c?: Buffer) => void) => void },
    cb: (e: null, b: Buffer) => void,
  ) => {
    const chunks: Buffer[] = [];
    res.on('data', (c?: Buffer) => chunks.push(c!));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  it('client declares → admin validates → admin generates the invoice → client downloads → admin sends', async () => {
    const mission = await w.activeMission();
    const { id: paymentId } = await w.payment(mission.id, 2400.5);

    // invoice IMPOSSIBLE before validation
    await w
      .api()
      .post(`/api/admin/payments/${paymentId}/invoice`)
      .set('Authorization', w.auth.superadmin)
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('PAYMENT_NOT_VALIDATED'));

    const validated = await w
      .api()
      .patch(`/api/admin/payments/${paymentId}/validate`)
      .set('Authorization', w.auth.superadmin)
      .expect(200);
    expect(validated.body).toMatchObject({ isValidated: true, amount: 2400.5 });
    await w
      .api()
      .patch(`/api/admin/payments/${paymentId}/validate`)
      .set('Authorization', w.auth.superadmin)
      .expect(409);

    const invoice = await w
      .api()
      .post(`/api/admin/payments/${paymentId}/invoice`)
      .set('Authorization', w.auth.superadmin)
      .expect(201);
    const year = new Date().getUTCFullYear();
    expect(invoice.body).toMatchObject({
      invoiceNumber: `FAC-${year}-0001`,
      paymentId,
      missionId: mission.id,
      clientId: w.actors.client.id,
      amount: 2400.5,
      sentAt: null,
    });
    const invoiceId = invoice.body.id as string;
    await w
      .api()
      .post(`/api/admin/payments/${paymentId}/invoice`)
      .set('Authorization', w.auth.superadmin)
      .expect(409)
      .expect((r) => expect(r.body.error).toBe('CLIENT_INVOICE_ALREADY_EXISTS'));

    const mine = await w
      .api()
      .get('/api/client/invoices')
      .set('Authorization', w.auth.client)
      .expect(200);
    expect(mine.body.data.map((i: { id: string }) => i.id)).toEqual([invoiceId]);
    const other = await w
      .api()
      .get('/api/client/invoices')
      .set('Authorization', w.auth.client2)
      .expect(200);
    expect(other.body.data).toEqual([]);

    const pdf = await w
      .api()
      .get(`/api/client/invoices/${invoiceId}/download`)
      .set('Authorization', w.auth.client)
      .buffer(true)
      .parse(binary)
      .expect(200)
      .expect('content-type', /pdf/);
    expect((pdf.body as Buffer).subarray(0, 8).toString()).toBe('%PDF-1.4');
    expect((pdf.body as Buffer).toString('latin1')).toContain(`FAC-${year}-0001`);
    await w
      .api()
      .get(`/api/client/invoices/${invoiceId}/download`)
      .set('Authorization', w.auth.client2)
      .expect(404);
    await w
      .api()
      .get(`/api/admin/client-invoices/${invoiceId}/download`)
      .set('Authorization', w.auth.admin)
      .expect(200);

    await w
      .api()
      .post(`/api/admin/client-invoices/${invoiceId}/send`)
      .set('Authorization', w.auth.admin)
      .expect(403); // no validate-payments
    const sent = await w
      .api()
      .post(`/api/admin/client-invoices/${invoiceId}/send`)
      .set('Authorization', w.auth.superadmin)
      .expect(200);
    expect(sent.body.sentAt).not.toBeNull();
    const sentList = await w
      .api()
      .get('/api/admin/client-invoices?sent=true')
      .set('Authorization', w.auth.admin)
      .expect(200);
    expect(sentList.body.meta.total).toBe(1);

    const db = getTestPrisma();
    const notifications = await db.notification.findMany({
      where: { userId: w.actors.client.id, type: { in: ['payment', 'client-invoice'] } },
      orderBy: { createdAt: 'asc' },
    });
    expect(notifications.map((n) => n.type)).toEqual(['payment', 'client-invoice']);
    expect(await db.auditLog.count({ where: { entity: 'Payment', entityId: paymentId } })).toBe(2);
    expect(
      await db.auditLog.count({ where: { entity: 'ClientInvoice', entityId: invoiceId } }),
    ).toBe(2);
  });

  it('audiences: client sees theirs, consultant sees payments of their missions (no proof), admin filters', async () => {
    const mission = await w.activeMission();
    const a = await w.payment(mission.id, 100);
    const b = await w.payment(mission.id, 200);
    await w
      .api()
      .patch(`/api/admin/payments/${b.id}/validate`)
      .set('Authorization', w.auth.superadmin)
      .expect(200);

    const ids = async (path: string, auth: string) =>
      (await w.api().get(path).set('Authorization', auth).expect(200)).body.data
        .map((p: { id: string }) => p.id)
        .sort();
    expect(await ids('/api/payments', w.auth.client)).toEqual([a.id, b.id].sort());
    expect(await ids('/api/payments', w.auth.client2)).toEqual([]);
    expect(await ids('/api/payments?isValidated=true', w.auth.client)).toEqual([b.id]);
    expect(await ids('/api/consultant/payments', w.auth.consultant2)).toEqual([a.id, b.id].sort());
    const consultantView = await w
      .api()
      .get('/api/consultant/payments')
      .set('Authorization', w.auth.consultant)
      .expect(200);
    expect(consultantView.body.data[0]).not.toHaveProperty('proofFileName');
    expect(await ids(`/api/admin/payments?clientId=${w.client2.id}`, w.auth.admin)).toEqual([]);
    expect(await ids(`/api/admin/payments?consultantId=${w.consultant2.id}`, w.auth.admin)).toEqual(
      [a.id, b.id].sort(),
    );
    expect(
      await ids(`/api/admin/payments?missionId=${mission.id}&isValidated=false`, w.auth.admin),
    ).toEqual([a.id]);

    await w
      .api()
      .get(`/api/payments/${a.id}/download`)
      .set('Authorization', w.auth.client)
      .expect(200)
      .expect('content-type', /pdf/);
    await w.api().get(`/api/payments/${a.id}`).set('Authorization', w.auth.client2).expect(404);
    await w.api().get(`/api/admin/payments/${a.id}`).set('Authorization', w.auth.admin).expect(200);
    await w.api().get(`/api/payments/${a.id}`).set('Authorization', w.auth.consultant).expect(403);
  });

  it("guards: someone else's mission 404, bad amount 400, wrong proof type 422, validation needs validate-payments", async () => {
    const mission = await w.activeMission();
    const post = (auth: string, fields: Record<string, string>, name = 'v.pdf') => {
      const req = w.api().post('/api/payments').set('Authorization', auth);
      for (const [k, v] of Object.entries(fields)) req.field(k, v);
      return req.attach('file', PDF('v'), name);
    };
    await post(w.auth.client2, { missionId: mission.id, amount: '10' })
      .expect(404)
      .expect((r) => expect(r.body.error).toBe('MISSION_NOT_FOUND'));
    await post(w.auth.client, { missionId: mission.id, amount: '-5' }).expect(400);
    await post(w.auth.client, { missionId: mission.id, amount: '10' }, 'v.exe')
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('FILE_TYPE_NOT_ALLOWED'));
    await post(w.auth.consultant, { missionId: mission.id, amount: '10' }).expect(403);
    await w
      .api()
      .post('/api/payments')
      .set('Authorization', w.auth.client)
      .field('missionId', mission.id)
      .field('amount', '10')
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('FILE_REQUIRED'));

    const { id } = await w.payment(mission.id);
    await w
      .api()
      .patch(`/api/admin/payments/${id}/validate`)
      .set('Authorization', w.auth.admin)
      .expect(403);
    await w
      .api()
      .post(`/api/admin/payments/${id}/invoice`)
      .set('Authorization', w.auth.admin)
      .expect(403);
    await w.api().get('/api/admin/payments').set('Authorization', w.auth.client).expect(403);
  });
});
