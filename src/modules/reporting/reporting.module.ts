import { Module } from '@nestjs/common';
import { DashboardController } from './interface/http/dashboard.controller';

/** LOT 1: RBAC probe only. LOT 7 fills this with real read-model queries. */
@Module({
  controllers: [DashboardController],
})
export class ReportingModule {}
