import {
  CommissionsDashboard,
  DashboardSummary,
  MissionsDashboard,
  PaymentsDashboard,
  QuotesDashboard,
  UsersDashboard,
} from '../read-models/dashboard.read-models';
import { ReportingPeriod } from '../reporting-period';

export const REPORTING_QUERIES = Symbol('REPORTING_QUERIES');

/**
 * PORT (query side only). Implementations aggregate the other contexts' tables in SQL and
 * never re-implement their rules: statuses are read as stored, counts are plain counts.
 * Monthly series may be sparse; the application fills the missing months.
 */
export abstract class ReportingQueriesPort {
  abstract summary(): Promise<Omit<DashboardSummary, 'generatedAt'>>;
  abstract quotes(period: ReportingPeriod): Promise<Omit<QuotesDashboard, 'period'>>;
  abstract missions(period: ReportingPeriod, now: Date): Promise<Omit<MissionsDashboard, 'period'>>;
  abstract payments(period: ReportingPeriod): Promise<Omit<PaymentsDashboard, 'period'>>;
  abstract commissions(): Promise<CommissionsDashboard>;
  abstract users(period: ReportingPeriod): Promise<Omit<UsersDashboard, 'period'>>;
}
