import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK } from '@shared/kernel';
import { ActorContext, UseCase } from '@shared/application/use-case';
import { requireAdminWith } from '@shared/application/actor';
import { REPORTING_QUERIES, ReportingQueriesPort } from '../ports/reporting-queries.port';
import { fillMonths, reportingPeriod, ReportingPeriod } from '../reporting-period';
import {
  CommissionsDashboard,
  DashboardSummary,
  MissionsDashboard,
  PaymentsDashboard,
  PeriodInfo,
  QuotesDashboard,
  UsersDashboard,
} from '../read-models/dashboard.read-models';

export const REPORTING_PERMISSION = 'view-statistics';

export interface DashboardInput {
  actor: ActorContext;
}

export interface PeriodDashboardInput extends DashboardInput {
  from?: Date;
  to?: Date;
}

const periodInfo = (p: ReportingPeriod): PeriodInfo => ({
  from: p.from,
  to: p.to,
  months: p.months,
});

const zero = { count: 0, amount: 0 };

/** Shared wiring: permission check (not only the guard) and clock. */
abstract class DashboardQuery {
  constructor(
    @Inject(REPORTING_QUERIES) protected readonly reporting: ReportingQueriesPort,
    @Inject(CLOCK) protected readonly clock: Clock,
  ) {}

  protected period(input: PeriodDashboardInput): ReportingPeriod {
    requireAdminWith(input.actor, REPORTING_PERMISSION);
    return reportingPeriod(this.clock.now(), input.from, input.to);
  }
}

@Injectable()
export class GetDashboardSummaryQuery
  extends DashboardQuery
  implements UseCase<DashboardInput, DashboardSummary>
{
  async execute(input: DashboardInput): Promise<DashboardSummary> {
    requireAdminWith(input.actor, REPORTING_PERMISSION);
    const now = this.clock.now();
    return { ...(await this.reporting.summary()), generatedAt: now };
  }
}

@Injectable()
export class GetQuotesDashboardQuery
  extends DashboardQuery
  implements UseCase<PeriodDashboardInput, QuotesDashboard>
{
  async execute(input: PeriodDashboardInput): Promise<QuotesDashboard> {
    const period = this.period(input);
    const data = await this.reporting.quotes(period);
    return {
      ...data,
      period: periodInfo(period),
      monthly: fillMonths(period, data.monthly, (month) => ({ month, created: 0, validated: 0 })),
    };
  }
}

@Injectable()
export class GetMissionsDashboardQuery
  extends DashboardQuery
  implements UseCase<PeriodDashboardInput, MissionsDashboard>
{
  async execute(input: PeriodDashboardInput): Promise<MissionsDashboard> {
    const period = this.period(input);
    const data = await this.reporting.missions(period, this.clock.now());
    return {
      ...data,
      period: periodInfo(period),
      monthly: fillMonths(period, data.monthly, (month) => ({ month, created: 0 })),
    };
  }
}

@Injectable()
export class GetPaymentsDashboardQuery
  extends DashboardQuery
  implements UseCase<PeriodDashboardInput, PaymentsDashboard>
{
  async execute(input: PeriodDashboardInput): Promise<PaymentsDashboard> {
    const period = this.period(input);
    const data = await this.reporting.payments(period);
    return {
      ...data,
      period: periodInfo(period),
      monthly: fillMonths(period, data.monthly, (month) => ({
        month,
        validated: { ...zero },
        pending: { ...zero },
      })),
    };
  }
}

@Injectable()
export class GetCommissionsDashboardQuery
  extends DashboardQuery
  implements UseCase<DashboardInput, CommissionsDashboard>
{
  async execute(input: DashboardInput): Promise<CommissionsDashboard> {
    requireAdminWith(input.actor, REPORTING_PERMISSION);
    return this.reporting.commissions();
  }
}

@Injectable()
export class GetUsersDashboardQuery
  extends DashboardQuery
  implements UseCase<PeriodDashboardInput, UsersDashboard>
{
  async execute(input: PeriodDashboardInput): Promise<UsersDashboard> {
    const period = this.period(input);
    const data = await this.reporting.users(period);
    return {
      ...data,
      period: periodInfo(period),
      monthly: fillMonths(period, data.monthly, (month) => ({ month, created: 0 })),
    };
  }
}
