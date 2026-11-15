import { ValidationException } from '@shared/kernel';

export const DEFAULT_PERIOD_MONTHS = 12;
export const MAX_PERIOD_MONTHS = 60;

/** A [from, to) window aligned on whole UTC months, used by every monthly series. */
export interface ReportingPeriod {
  /** first instant of the first month (inclusive) */
  from: Date;
  /** first instant of the month after the last one (exclusive) */
  to: Date;
  /** `YYYY-MM` labels, oldest first */
  months: string[];
}

const startOfMonth = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const addMonths = (d: Date, n: number): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));

export const monthLabel = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export const invalidPeriod = (reason: string): ValidationException =>
  new ValidationException('INVALID_PERIOD', reason, { maxMonths: MAX_PERIOD_MONTHS });

/**
 * Months touched by [from, to]; defaults to the last 12 months including the current one.
 * `to` alone → the 12 months ending with it; `from` alone → from it to the current month.
 */
export const reportingPeriod = (now: Date, from?: Date, to?: Date): ReportingPeriod => {
  const last = startOfMonth(to ?? now);
  const first = from ? startOfMonth(from) : addMonths(last, 1 - DEFAULT_PERIOD_MONTHS);
  if (first > last) throw invalidPeriod('`from` must not be after `to`');
  const months: string[] = [];
  for (let m = first; m <= last; m = addMonths(m, 1)) {
    months.push(monthLabel(m));
    if (months.length > MAX_PERIOD_MONTHS)
      throw invalidPeriod(`The period cannot exceed ${MAX_PERIOD_MONTHS} months`);
  }
  return { from: first, to: addMonths(last, 1), months };
};

/** Completes a sparse series with zeroed months, in period order. */
export const fillMonths = <T extends { month: string }>(
  period: ReportingPeriod,
  rows: readonly T[],
  empty: (month: string) => T,
): T[] => {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return period.months.map((m) => byMonth.get(m) ?? empty(m));
};
