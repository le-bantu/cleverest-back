/** Read models of the admin dashboard. Amounts are EUR, rounded to cents. */

export interface CountAndAmount {
  count: number;
  amount: number;
}

/** status label (as exposed by its context, e.g. `SIGNÉ_CLIENT`) → count */
export type CountByStatus = Record<string, number>;

export interface PeriodInfo {
  from: Date;
  /** exclusive */
  to: Date;
  months: string[];
}

export interface DashboardSummary {
  quotes: { total: number; byStatus: CountByStatus };
  missions: { total: number; active: number; completed: number; byStatus: CountByStatus };
  payments: { validated: CountAndAmount; pending: CountAndAmount };
  commissions: { byStatus: Record<string, CountAndAmount> };
  users: { total: number; byRole: Record<string, number> };
  reviews: { count: number; averageRating: number | null };
  generatedAt: Date;
}

export interface QuoteMonth {
  month: string;
  created: number;
  /** price validated by an admin that month (`validatedAt`) */
  validated: number;
}

export interface QuotesDashboard {
  period: PeriodInfo;
  byStatus: CountByStatus;
  byType: Record<string, number>;
  monthly: QuoteMonth[];
}

export interface MissionMonth {
  month: string;
  created: number;
}

export interface MissionsDashboard {
  period: PeriodInfo;
  byStatus: CountByStatus;
  active: number;
  completed: number;
  /** open (not TERMINÉE / REJETÉE) with a delivery date in the past */
  overdue: number;
  /** mean progress of EN_COURS / EN_VALIDATION missions; null when none */
  averageProgress: number | null;
  monthly: MissionMonth[];
}

export interface PaymentMonth {
  month: string;
  /** validated that month (`validatedAt`) */
  validated: CountAndAmount;
  /** declared that month and still awaiting validation */
  pending: CountAndAmount;
}

export interface PaymentsDashboard {
  period: PeriodInfo;
  validated: CountAndAmount;
  pending: CountAndAmount;
  /** client invoices issued */
  invoiced: CountAndAmount;
  consultantInvoices: { paid: CountAndAmount; unpaid: CountAndAmount };
  monthly: PaymentMonth[];
}

export interface ApporteurCommissions {
  apporteurId: string;
  name: string | null;
  email: string | null;
  count: number;
  /** sum of the amounts already set */
  amount: number;
  byStatus: Record<string, CountAndAmount>;
}

export interface CommissionsDashboard {
  byStatus: Record<string, CountAndAmount>;
  /** commissions whose amount is not set yet */
  withoutAmount: number;
  byApporteur: ApporteurCommissions[];
}

export interface UserMonth {
  month: string;
  created: number;
}

export interface UsersDashboard {
  period: PeriodInfo;
  total: number;
  active: number;
  inactive: number;
  /** a user holding several roles counts in each */
  byRole: Record<string, number>;
  consultants: { validated: number; pending: number };
  monthly: UserMonth[];
}
