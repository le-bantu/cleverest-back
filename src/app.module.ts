import { Module } from '@nestjs/common';
import { SharedModule } from '@shared/shared.module';
import { HealthController } from '@shared/interface/http/health.controller';
import { IdentityAccessModule } from '@modules/identity-access/identity-access.module';
import { ReportingModule } from '@modules/reporting/reporting.module';

@Module({
  imports: [SharedModule, IdentityAccessModule, ReportingModule],
  controllers: [HealthController],
})
export class AppModule {}
