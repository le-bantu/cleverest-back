import { actors } from '@shared/testing/fakes';
import { NOW, reportingTestContext } from '../../testing/fake-reporting';
import {
  GetCommissionsDashboardQuery,
  GetDashboardSummaryQuery,
  GetMissionsDashboardQuery,
  GetPaymentsDashboardQuery,
  GetQuotesDashboardQuery,
  GetUsersDashboardQuery,
} from './dashboard.queries';

const viewer = () => actors.admin(['view-statistics']);

const build = () => {
  const { reporting, clock } = reportingTestContext();
  return {
    reporting,
    summary: new GetDashboardSummaryQuery(reporting, clock),
    quotes: new GetQuotesDashboardQuery(reporting, clock),
    missions: new GetMissionsDashboardQuery(reporting, clock),
    payments: new GetPaymentsDashboardQuery(reporting, clock),
    commissions: new GetCommissionsDashboardQuery(reporting, clock),
    users: new GetUsersDashboardQuery(reporting, clock),
  };
};

describe('dashboard queries', () => {
  it('summary is stamped with the clock', async () => {
    const { summary } = build();
    expect(await summary.execute({ actor: viewer() })).toMatchObject({
      quotes: { total: 1 },
      users: { byRole: { client: 1, admin: 1 } },
      generatedAt: NOW,
    });
  });

  it('period series: default 12 months, zero-filled, with the period echoed', async () => {
    const { quotes, missions, payments, users, reporting } = build();
    const q = await quotes.execute({ actor: viewer() });
    expect(q.period.months).toHaveLength(12);
    expect(q.monthly).toHaveLength(12);
    expect(q.monthly[0]).toEqual({ month: '2025-12', created: 0, validated: 0 });
    expect(q.monthly[11]).toEqual({ month: '2026-11', created: 2, validated: 1 });

    const range = { from: new Date('2026-09-01'), to: new Date('2026-10-31') };
    const m = await missions.execute({ actor: viewer(), ...range });
    expect(m.monthly).toEqual([
      { month: '2026-09', created: 4 },
      { month: '2026-10', created: 0 },
    ]);
    expect(reporting.nows).toEqual([NOW]);

    const p = await payments.execute({ actor: viewer(), ...range });
    expect(p.monthly[1]).toEqual({
      month: '2026-10',
      validated: { count: 0, amount: 0 },
      pending: { count: 0, amount: 0 },
    });
    expect(p.monthly[0].validated).toEqual({ count: 1, amount: 10 });

    const u = await users.execute({ actor: viewer(), ...range });
    expect(u.monthly.map((x) => x.created)).toEqual([0, 0]);
    expect(u.period).toEqual({
      from: new Date('2026-09-01T00:00:00Z'),
      to: new Date('2026-11-01T00:00:00Z'),
      months: ['2026-09', '2026-10'],
    });
  });

  it('an invalid period is refused before querying', async () => {
    const { quotes, reporting } = build();
    await expect(
      quotes.execute({ actor: viewer(), from: new Date('2026-10-01'), to: new Date('2026-01-01') }),
    ).rejects.toMatchObject({ code: 'INVALID_PERIOD', httpStatus: 422 });
    expect(reporting.periods).toHaveLength(0);
  });

  it('commissions pass through', async () => {
    const { commissions } = build();
    expect(await commissions.execute({ actor: viewer() })).toEqual({
      byStatus: {},
      withoutAmount: 0,
      byApporteur: [],
    });
  });

  it('every query needs an admin holding view-statistics', async () => {
    const all = build();
    const queries = [
      all.summary,
      all.quotes,
      all.missions,
      all.payments,
      all.commissions,
      all.users,
    ];
    for (const query of queries) {
      await expect(query.execute({ actor: actors.admin() })).rejects.toMatchObject({
        code: 'PERMISSION_REQUIRED',
        httpStatus: 403,
      });
      await expect(
        query.execute({ actor: { ...actors.client(), permissions: ['view-statistics'] } }),
      ).rejects.toMatchObject({ code: 'ROLE_NOT_ALLOWED' });
    }
    expect(all.reporting.periods).toHaveLength(0);
  });
});
