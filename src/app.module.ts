import { Module } from '@nestjs/common';
import { SharedModule } from '@shared/shared.module';
import { HealthController } from '@shared/interface/http/health.controller';
import { IdentityAccessModule } from '@modules/identity-access/identity-access.module';
import { QuotesModule } from '@modules/quotes/quotes.module';
import { ReportingModule } from '@modules/reporting/reporting.module';

@Module({
  imports: [SharedModule, IdentityAccessModule, QuotesModule, ReportingModule],
  controllers: [HealthController],
})
export class AppModule {}
