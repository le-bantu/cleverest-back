import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '@shared/interface/http/decorators/roles.decorator';
import { RequirePermissions } from '@shared/interface/http/decorators/require-permissions.decorator';

/**
 * LOT 1 placeholder. The real aggregations land in LOT 7 (`reporting`).
 * It exists now so the RBAC wiring can be proven end-to-end: this route is
 * gated by the `view-statistics` permission, which `superadmin` holds and a
 * bare `admin` does not — making `admin` != `superadmin` observable.
 */
@ApiTags('reporting')
@Controller('admin/dashboard')
export class DashboardController {
  @Get('summary')
  @Roles('admin', 'superadmin')
  @RequirePermissions('view-statistics')
  summary() {
    return { placeholder: true, module: 'reporting', implementedInLot: 7 };
  }
}
