import { Module } from '@nestjs/common';
import { reportingInfrastructureProviders } from './infrastructure/reporting.providers';
import {
  GetCommissionsDashboardQuery,
  GetDashboardSummaryQuery,
  GetMissionsDashboardQuery,
  GetPaymentsDashboardQuery,
  GetQuotesDashboardQuery,
  GetUsersDashboardQuery,
} from './application';
import { DashboardController } from './interface/http/dashboard.controller';

/** Read-only context: projections over the other contexts' data, no entity of its own. */
@Module({
  controllers: [DashboardController],
  providers: [
    ...reportingInfrastructureProviders,
    GetDashboardSummaryQuery,
    GetQuotesDashboardQuery,
    GetMissionsDashboardQuery,
    GetPaymentsDashboardQuery,
    GetCommissionsDashboardQuery,
    GetUsersDashboardQuery,
  ],
})
export class ReportingModule {}
