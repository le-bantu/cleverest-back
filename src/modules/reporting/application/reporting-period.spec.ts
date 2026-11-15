import { fillMonths, monthLabel, reportingPeriod } from './reporting-period';

const NOW = new Date('2026-11-15T10:00:00.000Z');

describe('reportingPeriod', () => {
  it('defaults to the last 12 UTC months including the current one', () => {
    const p = reportingPeriod(NOW);
    expect(p.months).toHaveLength(12);
    expect(p.months[0]).toBe('2025-12');
    expect(p.months[11]).toBe('2026-11');
    expect(p.from).toEqual(new Date('2025-12-01T00:00:00.000Z'));
    expect(p.to).toEqual(new Date('2026-12-01T00:00:00.000Z'));
  });

  it('aligns from/to on whole months; `to` alone gives the 12 months ending with it', () => {
    const p = reportingPeriod(
      NOW,
      new Date('2026-02-20T00:00:00Z'),
      new Date('2026-04-02T00:00:00Z'),
    );
    expect(p.months).toEqual(['2026-02', '2026-03', '2026-04']);
    expect(p.to).toEqual(new Date('2026-05-01T00:00:00.000Z'));
    const q = reportingPeriod(NOW, undefined, new Date('2026-06-10T00:00:00Z'));
    expect(q.months[0]).toBe('2025-07');
    expect(q.months.at(-1)).toBe('2026-06');
    expect(reportingPeriod(NOW, new Date('2026-10-01T00:00:00Z')).months).toEqual([
      '2026-10',
      '2026-11',
    ]);
    // a single month, and a year boundary
    expect(reportingPeriod(NOW, NOW, NOW).months).toEqual(['2026-11']);
    expect(
      reportingPeriod(NOW, new Date('2025-12-31T23:59:59Z'), new Date('2026-01-01T00:00:00Z'))
        .months,
    ).toEqual(['2025-12', '2026-01']);
  });

  it('refuses an inverted period and more than 60 months (422 INVALID_PERIOD)', () => {
    expect(() => reportingPeriod(NOW, new Date('2026-05-01'), new Date('2026-04-01'))).toThrow(
      expect.objectContaining({ code: 'INVALID_PERIOD', httpStatus: 422 }),
    );
    expect(reportingPeriod(NOW, new Date('2021-12-01'), NOW).months).toHaveLength(60);
    expect(() => reportingPeriod(NOW, new Date('2021-11-01'), NOW)).toThrow(
      expect.objectContaining({ code: 'INVALID_PERIOD' }),
    );
  });

  it('fillMonths completes a sparse series in order', () => {
    const p = reportingPeriod(NOW, new Date('2026-08-01'), NOW);
    expect(
      fillMonths(
        p,
        [
          { month: '2026-10', n: 3 },
          { month: '2026-08', n: 1 },
        ],
        (month) => ({
          month,
          n: 0,
        }),
      ),
    ).toEqual([
      { month: '2026-08', n: 1 },
      { month: '2026-09', n: 0 },
      { month: '2026-10', n: 3 },
      { month: '2026-11', n: 0 },
    ]);
    expect(monthLabel(new Date('2026-01-31T23:00:00Z'))).toBe('2026-01');
  });
});
