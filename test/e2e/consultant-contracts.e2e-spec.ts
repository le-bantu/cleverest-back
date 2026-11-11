import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../utils/http-app';
import { getTestPrisma } from '../utils/test-db';
import { LifecycleWorld, PDF } from '../fixtures/lifecycle';

describe('consultant contracts (e2e)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;
  let w: LifecycleWorld;

  beforeAll(async () => {
    ({ app, close } = await createTestApp());
    w = new LifecycleWorld(app);
  });
  afterAll(() => close());
  beforeEach(() => w.reset());

  /** Client quote split between `consultant` and `consultant2`; only the first subquote is priced + validated. */
  const splitQuote = async () => {
    const quote = await w
      .api()
      .post('/api/quotes')
      .set('Authorization', w.auth.client)
      .send({ type: 'CONSULTATION', title: 'Audit', description: 'Audit fiscal' })
      .expect(201);
    const split = await w
      .api()
      .post(`/api/admin/quotes/${quote.body.id as string}/split`)
      .set('Authorization', w.auth.superadmin)
      .send({ consultants: [w.actors.consultant.id, w.consultant2.id] })
      .expect(201);
    const [sub1, sub2] = split.body.subquotes as Array<{ id: string }>;
    await w
      .api()
      .patch(`/api/consultant/quotes/${sub1.id}/submit`)
      .set('Authorization', w.auth.consultant)
      .send({ price: 700 })
      .expect(200);
    await w
      .api()
      .patch(`/api/admin/quotes/${sub1.id}/validate`)
      .set('Authorization', w.auth.superadmin)
      .send({ status: 'VALIDÉ_ADMIN' })
      .expect(200);
    return { mainId: quote.body.id as string, sub1: sub1.id, sub2: sub2.id };
  };

  const create = (fields: Record<string, string>, auth = w.auth.superadmin, name = 'e.pdf') => {
    const req = w.api().post('/api/admin/consultant-contracts').set('Authorization', auth);
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    return req.attach('file', PDF('engagement'), name);
  };

  it('subquote → admin draws up the engagement at the consultant price → consultant signs', async () => {
    const q = await splitQuote();
    const res = await create({ quoteId: q.sub1, consultantId: w.actors.consultant.id }).expect(201);
    expect(res.body).toMatchObject({
      quoteId: q.sub1,
      rootQuoteId: q.mainId,
      consultantId: w.actors.consultant.id,
      amount: 700,
      signed: false,
      originalFileName: 'e.pdf',
    });
    const id = res.body.id as string;

    // only the bound consultant sees it
    const mine = await w
      .api()
      .get('/api/consultant/contracts')
      .set('Authorization', w.auth.consultant)
      .expect(200);
    expect(mine.body.data.map((c: { id: string }) => c.id)).toEqual([id]);
    const theirs = await w
      .api()
      .get('/api/consultant/contracts')
      .set('Authorization', w.auth.consultant2)
      .expect(200);
    expect(theirs.body.data).toEqual([]);
    await w
      .api()
      .get(`/api/consultant/contracts/${id}`)
      .set('Authorization', w.auth.consultant2)
      .expect(404);
    await w
      .api()
      .get(`/api/consultant/contracts/${id}/download-original`)
      .set('Authorization', w.auth.consultant)
      .expect(200)
      .expect('content-type', /pdf/);
    await w
      .api()
      .get(`/api/consultant/contracts/${id}/download-signed`)
      .set('Authorization', w.auth.consultant)
      .expect(404);

    await w.signConsultantContract(id, w.auth.consultant);
    const signed = await w
      .api()
      .get(`/api/admin/consultant-contracts/${id}`)
      .set('Authorization', w.auth.admin)
      .expect(200);
    expect(signed.body).toMatchObject({ signed: true, signedFileName: 'engagement-signe.pdf' });
    await w
      .api()
      .get(`/api/admin/consultant-contracts/${id}/download-signed`)
      .set('Authorization', w.auth.admin)
      .expect(200);
    await w
      .api()
      .patch(`/api/consultant/contracts/${id}`)
      .set('Authorization', w.auth.consultant)
      .attach('file', PDF('again'), 'again.pdf')
      .expect(409)
      .expect((r) => expect(r.body.error).toBe('CONSULTANT_CONTRACT_ALREADY_SIGNED'));

    const db = getTestPrisma();
    expect(
      await db.notification.count({
        where: { userId: w.actors.consultant.id, type: 'consultant-contract' },
      }),
    ).toBe(1);
    expect(
      await db.notification.count({
        where: { userId: w.actors.superadmin.id, type: 'consultant-contract' },
      }),
    ).toBe(1);
    expect(await db.auditLog.count({ where: { entity: 'ConsultantContract', entityId: id } })).toBe(
      2,
    );

    // the main quote is now bound: it cannot be deleted
    await w
      .api()
      .delete(`/api/admin/quotes/${q.mainId}`)
      .set('Authorization', w.auth.superadmin)
      .expect(409)
      .expect((r) => expect(r.body.error).toBe('QUOTE_HAS_CONTRACT'));
  });

  it('business guards: price not validated, consultant not on the quote, duplicate, amount, PDF only', async () => {
    const q = await splitQuote();
    const expectError = (code: string) => (r: { body: { error: string } }) =>
      expect(r.body.error).toBe(code);
    await create({ quoteId: q.sub2, consultantId: w.consultant2.id })
      .expect(422)
      .expect(expectError('QUOTE_NOT_VALIDATED'));
    await create({ quoteId: q.sub1, consultantId: w.consultant2.id })
      .expect(422)
      .expect(expectError('CONSULTANT_NOT_ON_QUOTE'));
    await create(
      { quoteId: q.sub1, consultantId: w.actors.consultant.id },
      w.auth.superadmin,
      'e.docx',
    ).expect(422);
    await create({ quoteId: q.sub1, consultantId: w.actors.consultant.id, amount: '-3' }).expect(
      400,
    );
    await create({ quoteId: q.sub1, consultantId: w.actors.consultant.id }).expect(201);
    await create({ quoteId: q.sub1, consultantId: w.actors.consultant.id })
      .expect(409)
      .expect(expectError('CONSULTANT_CONTRACT_ALREADY_EXISTS'));
    await create({
      quoteId: '00000000-0000-4000-8000-000000000000',
      consultantId: w.consultant2.id,
    }).expect(404);

    // non-split quote: the amount is required (its price is the client price)
    const main = await w.validatedQuote();
    await create({ quoteId: main.id, consultantId: w.consultant2.id })
      .expect(422)
      .expect(expectError('AMOUNT_REQUIRED'));
    const ok = await create({
      quoteId: main.id,
      consultantId: w.consultant2.id,
      amount: '450.5',
    }).expect(201);
    expect(ok.body).toMatchObject({ rootQuoteId: main.id, amount: 450.5 });
  });

  it('admin lists with filters, withdraws an unsigned contract, cannot withdraw a signed one', async () => {
    const main = await w.validatedQuote();
    const a = await w.consultantContract(main.id, w.actors.consultant.id, 300);
    const b = await w.consultantContract(main.id, w.consultant2.id, 200);
    await w.signConsultantContract(a.id, w.auth.consultant);

    const ids = async (query: string) =>
      (
        await w
          .api()
          .get(`/api/admin/consultant-contracts${query}`)
          .set('Authorization', w.auth.admin)
          .expect(200)
      ).body.data
        .map((c: { id: string }) => c.id)
        .sort();
    expect(await ids('')).toEqual([a.id, b.id].sort());
    expect(await ids(`?rootQuoteId=${main.id}&signed=true`)).toEqual([a.id]);
    expect(await ids(`?consultantId=${w.consultant2.id}`)).toEqual([b.id]);
    expect(await ids(`?quoteId=${main.id}&sort=amount:asc&perPage=1`)).toEqual([b.id]);

    await w
      .api()
      .delete(`/api/admin/consultant-contracts/${a.id}`)
      .set('Authorization', w.auth.superadmin)
      .expect(409);
    await w
      .api()
      .delete(`/api/admin/consultant-contracts/${b.id}`)
      .set('Authorization', w.auth.superadmin)
      .expect(204);
    expect(await ids('')).toEqual([a.id]);
  });

  it('roles: client and consultants kept out of admin routes; clients out of consultant routes', async () => {
    const main = await w.validatedQuote();
    const c = await w.consultantContract(main.id, w.actors.consultant.id, 300);
    await w.api().get('/api/consultant/contracts').expect(401);
    await w.api().get('/api/consultant/contracts').set('Authorization', w.auth.client).expect(403);
    await w
      .api()
      .get('/api/admin/consultant-contracts')
      .set('Authorization', w.auth.consultant)
      .expect(403);
    await create(
      { quoteId: main.id, consultantId: w.consultant2.id, amount: '1' },
      w.auth.consultant,
    ).expect(403);
    await w
      .api()
      .patch(`/api/consultant/contracts/${c.id}`)
      .set('Authorization', w.auth.consultant)
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('FILE_REQUIRED'));
  });
});
