import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@shared/interface/http/decorators/roles.decorator';
import { RequirePermissions } from '@shared/interface/http/decorators/require-permissions.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '@shared/interface/http/decorators/current-user.decorator';
import { actorOf } from '@shared/interface/http/http-helpers';
import {
  GetCommissionsDashboardQuery,
  GetDashboardSummaryQuery,
  GetMissionsDashboardQuery,
  GetPaymentsDashboardQuery,
  GetQuotesDashboardQuery,
  GetUsersDashboardQuery,
} from '../../application';
import { DashboardPeriodQuery } from './dto/dashboard.request';

/** `/admin/dashboard` — read-only aggregates, gated by `view-statistics`. */
@ApiTags('reporting')
@ApiBearerAuth()
@Controller('admin/dashboard')
@Roles('admin', 'superadmin')
@RequirePermissions('view-statistics')
export class DashboardController {
  constructor(
    private readonly summaryQuery: GetDashboardSummaryQuery,
    private readonly quotesQuery: GetQuotesDashboardQuery,
    private readonly missionsQuery: GetMissionsDashboardQuery,
    private readonly paymentsQuery: GetPaymentsDashboardQuery,
    private readonly commissionsQuery: GetCommissionsDashboardQuery,
    private readonly usersQuery: GetUsersDashboardQuery,
  ) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.summaryQuery.execute({ actor: actorOf(user) });
  }

  @Get('quotes')
  quotes(@CurrentUser() user: AuthenticatedUser, @Query() q: DashboardPeriodQuery) {
    return this.quotesQuery.execute({ actor: actorOf(user), ...q });
  }

  @Get('missions')
  missions(@CurrentUser() user: AuthenticatedUser, @Query() q: DashboardPeriodQuery) {
    return this.missionsQuery.execute({ actor: actorOf(user), ...q });
  }

  @Get('payments')
  payments(@CurrentUser() user: AuthenticatedUser, @Query() q: DashboardPeriodQuery) {
    return this.paymentsQuery.execute({ actor: actorOf(user), ...q });
  }

  @Get('commissions')
  commissions(@CurrentUser() user: AuthenticatedUser) {
    return this.commissionsQuery.execute({ actor: actorOf(user) });
  }

  @Get('users')
  users(@CurrentUser() user: AuthenticatedUser, @Query() q: DashboardPeriodQuery) {
    return this.usersQuery.execute({ actor: actorOf(user), ...q });
  }
}
