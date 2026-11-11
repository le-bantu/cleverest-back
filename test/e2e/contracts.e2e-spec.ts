import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../utils/http-app';
import { getTestPrisma } from '../utils/test-db';
import { LifecycleWorld, PDF } from '../fixtures/lifecycle';

describe('contracts (e2e)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;
  let w: LifecycleWorld;

  beforeAll(async () => {
    ({ app, close } = await createTestApp());
    w = new LifecycleWorld(app);
  });
  afterAll(() => close());
  beforeEach(() => w.reset());

  it('admin uploads → client signs → quote SIGNÉ_CLIENT (single signature path, audited)', async () => {
    const quote = await w.validatedQuote();
    const created = await w
      .api()
      .post('/api/admin/contracts')
      .set('Authorization', w.auth.superadmin)
      .field('quoteId', quote.id)
      .attach('file', PDF('contrat'), 'Contrat cadre.pdf')
      .expect(201);
    expect(created.body).toMatchObject({
      quoteId: quote.id,
      clientId: w.actors.client.id,
      signed: false,
      signedAt: null,
      originalFileName: 'Contrat cadre.pdf',
    });
    const id = created.body.id as string;

    // the client sees it, filtered, and can download the original
    const mine = await w
      .api()
      .get('/api/contracts?signed=false')
      .set('Authorization', w.auth.client)
      .expect(200);
    expect(mine.body.data.map((c: { id: string }) => c.id)).toEqual([id]);
    const original = await w
      .api()
      .get(`/api/contracts/${id}/download-original`)
      .set('Authorization', w.auth.client)
      .expect(200);
    expect(original.headers['content-type']).toContain('application/pdf');
    expect(original.headers['content-disposition']).toContain('Contrat%20cadre.pdf');
    await w
      .api()
      .get(`/api/contracts/${id}/download-signed`)
      .set('Authorization', w.auth.client)
      .expect(404);

    // quotes list: hasContract filter (deferred from lot 2)
    const withContract = await w
      .api()
      .get('/api/quotes?hasContract=true')
      .set('Authorization', w.auth.client)
      .expect(200);
    expect(withContract.body.data.map((q: { id: string }) => q.id)).toEqual([quote.id]);
    await w
      .api()
      .get('/api/admin/quotes?hasContract=false')
      .set('Authorization', w.auth.superadmin)
      .expect(200)
      .expect((r) => expect(r.body.data).toEqual([]));

    // the old quote-level signature is refused
    await w
      .api()
      .patch(`/api/quotes/${quote.id}/sign`)
      .set('Authorization', w.auth.client)
      .send({ action: 'sign' })
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('SIGN_VIA_CONTRACT'));

    const signed = await w
      .api()
      .patch(`/api/contracts/${id}`)
      .set('Authorization', w.auth.client)
      .attach('file', PDF('signé'), 'signé.pdf')
      .expect(200);
    expect(signed.body).toMatchObject({ signed: true, signedFileName: 'signé.pdf' });
    expect(signed.body.signedAt).toEqual(expect.any(String));

    await w
      .api()
      .get(`/api/quotes/${quote.id}`)
      .set('Authorization', w.auth.client)
      .expect(200)
      .expect((r) => expect(r.body.status).toBe('SIGNÉ_CLIENT'));
    const signedFile = await w
      .api()
      .get(`/api/admin/contracts/${id}/download-signed`)
      .set('Authorization', w.auth.superadmin)
      .expect(200);
    expect(Buffer.from(signedFile.body as Buffer).toString()).toContain('signé');

    // a second signature is refused
    await w
      .api()
      .patch(`/api/contracts/${id}`)
      .set('Authorization', w.auth.client)
      .attach('file', PDF('again'), 'again.pdf')
      .expect(409)
      .expect((r) => expect(r.body.error).toBe('CONTRACT_ALREADY_SIGNED'));

    const audit = await getTestPrisma().auditLog.findMany({
      where: { entityId: { in: [id, quote.id] } },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => [a.entity, a.action, a.fromStatus, a.toStatus]).slice(-3)).toEqual([
      ['Contract', 'CREATED', null, 'UNSIGNED'],
      ['Quote', 'STATUS_CHANGED', 'VALIDÉ_ADMIN', 'SIGNÉ_CLIENT'],
      ['Contract', 'STATUS_CHANGED', 'UNSIGNED', 'SIGNED'],
    ]);
    // a quote with a contract can no longer be deleted
    await w
      .api()
      .delete(`/api/admin/quotes/${quote.id}`)
      .set('Authorization', w.auth.superadmin)
      .expect(409);
  });

  it('refuses a second contract (409), a non-validated quote (422) and a non-PDF (422)', async () => {
    const quote = await w.validatedQuote();
    await w.contractFor(quote.id);
    await w
      .api()
      .post('/api/admin/contracts')
      .set('Authorization', w.auth.superadmin)
      .field('quoteId', quote.id)
      .attach('file', PDF(), 'c.pdf')
      .expect(409)
      .expect((r) => expect(r.body.error).toBe('CONTRACT_ALREADY_EXISTS'));

    const pending = await w
      .api()
      .post('/api/quotes')
      .set('Authorization', w.auth.client)
      .send({ type: 'CONSULTATION', description: 'x' })
      .expect(201);
    await w
      .api()
      .post('/api/admin/contracts')
      .set('Authorization', w.auth.superadmin)
      .field('quoteId', pending.body.id as string)
      .attach('file', PDF(), 'c.pdf')
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('QUOTE_NOT_VALIDATED'));

    const other = await w.validatedQuote();
    await w
      .api()
      .post('/api/admin/contracts')
      .set('Authorization', w.auth.superadmin)
      .field('quoteId', other.id)
      .attach('file', Buffer.from('hello'), 'c.docx')
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('FILE_TYPE_NOT_ALLOWED'));
    await w
      .api()
      .post('/api/admin/contracts')
      .set('Authorization', w.auth.superadmin)
      .field('quoteId', other.id)
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('FILE_REQUIRED'));
  });

  it('authorization: 401 / 403 (role, permission) / 404 for another client', async () => {
    const quote = await w.validatedQuote();
    const contract = await w.contractFor(quote.id);
    await w.api().get('/api/contracts').expect(401);
    await w
      .api()
      .post('/api/admin/contracts')
      .set('Authorization', w.auth.admin) // bare admin: no manage-quotes
      .field('quoteId', quote.id)
      .attach('file', PDF(), 'c.pdf')
      .expect(403);
    await w.api().get('/api/admin/contracts').set('Authorization', w.auth.client).expect(403);
    await w.api().get('/api/contracts').set('Authorization', w.auth.consultant).expect(403);
    await w
      .api()
      .get(`/api/contracts/${contract.id}`)
      .set('Authorization', w.auth.client2)
      .expect(404);
    await w
      .api()
      .patch(`/api/contracts/${contract.id}`)
      .set('Authorization', w.auth.client2)
      .attach('file', PDF(), 's.pdf')
      .expect(404);
    // admin reads through both prefixes
    await w
      .api()
      .get(`/api/contracts/${contract.id}`)
      .set('Authorization', w.auth.admin)
      .expect(200);
    const list = await w
      .api()
      .get(`/api/admin/contracts?quoteId=${quote.id}`)
      .set('Authorization', w.auth.admin)
      .expect(200);
    expect(list.body.meta.total).toBe(1);
  });
});
