import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../utils/http-app';
import { getTestPrisma } from '../utils/test-db';
import { LifecycleWorld } from '../fixtures/lifecycle';

const ENDPOINTS = ['summary', 'quotes', 'missions', 'payments', 'commissions', 'users'];

describe('admin dashboard (e2e)', () => {
  let app: INestApplication;
  let close: () => Promise<void>;
  let w: LifecycleWorld;

  beforeAll(async () => {
    ({ app, close } = await createTestApp());
    w = new LifecycleWorld(app);
  });
  afterAll(() => close());
  beforeEach(() => w.reset());

  const get = (path: string, auth: string) =>
    w.api().get(`/api/admin/dashboard/${path}`).set('Authorization', auth);

  it('strictly gated by view-statistics: admin 403, client 403, anonymous 401', async () => {
    for (const path of ENDPOINTS) {
      await get(path, w.auth.admin).expect(403);
      await get(path, w.auth.client).expect(403);
      await w.api().get(`/api/admin/dashboard/${path}`).expect(401);
    }
  });

  it('an admin granted view-statistics gets access', async () => {
    const db = getTestPrisma();
    const permission = await db.permission.findUniqueOrThrow({
      where: { name: 'view-statistics' },
    });
    await db.userPermission.create({
      data: { userId: w.actors.admin.id, permissionId: permission.id },
    });
    await get('summary', await w.login(w.actors.admin.email)).expect(200);
  });

  it('superadmin: every endpoint answers with the expected shape and real figures', async () => {
    await w.completedMission();
    const summary = await get('summary', w.auth.superadmin).expect(200);
    expect(summary.body).toMatchObject({
      quotes: { total: 1, byStatus: { SIGNÉ_CLIENT: 1 } },
      missions: { total: 1, active: 0, completed: 1, byStatus: { TERMINÉE: 1 } },
      payments: { validated: { count: 0, amount: 0 }, pending: { count: 0, amount: 0 } },
      commissions: { byStatus: {} },
      users: { byRole: expect.objectContaining({ superadmin: 1, client: 2, consultant: 2 }) },
      reviews: { count: 0, averageRating: null },
    });
    expect(Date.parse(summary.body.generatedAt)).not.toBeNaN();

    const quotes = await get('quotes', w.auth.superadmin).expect(200);
    expect(quotes.body.period.months).toHaveLength(12);
    expect(quotes.body.monthly).toHaveLength(12);
    expect(quotes.body.monthly.at(-1)).toEqual({
      month: quotes.body.period.months.at(-1),
      created: 1,
      validated: 1,
    });
    expect(quotes.body.byType).toEqual({ CONSULTATION: 1 });

    const missions = await get('missions?from=2026-01-01&to=2026-03-31', w.auth.superadmin).expect(
      200,
    );
    expect(missions.body).toMatchObject({
      period: { months: ['2026-01', '2026-02', '2026-03'] },
      completed: 1,
      overdue: 0,
      averageProgress: null,
    });
    expect(missions.body.monthly).toHaveLength(3);

    const payments = await get('payments', w.auth.superadmin).expect(200);
    expect(payments.body).toMatchObject({
      invoiced: { count: 0, amount: 0 },
      consultantInvoices: { paid: { count: 0, amount: 0 }, unpaid: { count: 0, amount: 0 } },
    });
    expect(payments.body.monthly[0]).toEqual({
      month: payments.body.period.months[0],
      validated: { count: 0, amount: 0 },
      pending: { count: 0, amount: 0 },
    });

    await get('commissions', w.auth.superadmin)
      .expect(200)
      .expect((r) => expect(r.body).toEqual({ byStatus: {}, withoutAmount: 0, byApporteur: [] }));

    const users = await get('users', w.auth.superadmin).expect(200);
    expect(users.body).toMatchObject({ inactive: 0, consultants: expect.any(Object) });
    expect(users.body.total).toBe(users.body.active);
  });

  it('invalid periods: 422 INVALID_PERIOD, 400 for a malformed date', async () => {
    await get('quotes?from=2026-06-01&to=2026-01-01', w.auth.superadmin)
      .expect(422)
      .expect((r) => expect(r.body.error).toBe('INVALID_PERIOD'));
    await get('users?from=2010-01-01&to=2026-01-01', w.auth.superadmin).expect(422);
    await get('payments?from=yesterday', w.auth.superadmin).expect(400);
  });
});
