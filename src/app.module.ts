import { Module } from '@nestjs/common';
import { SharedModule } from '@shared/shared.module';
import { HealthController } from '@shared/interface/http/health.controller';
import { IdentityAccessModule } from '@modules/identity-access/identity-access.module';
import { QuotesModule } from '@modules/quotes/quotes.module';
import { ContractsModule } from '@modules/contracts/contracts.module';
import { MissionsModule } from '@modules/missions/missions.module';
import { DeliverablesModule } from '@modules/deliverables/deliverables.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { ConsultantInvoicesModule } from '@modules/consultant-invoices/consultant-invoices.module';
import { ApporteursModule } from '@modules/apporteurs/apporteurs.module';
import { ReportingModule } from '@modules/reporting/reporting.module';

@Module({
  imports: [
    SharedModule,
    IdentityAccessModule,
    QuotesModule,
    ContractsModule,
    MissionsModule,
    DeliverablesModule,
    PaymentsModule,
    ConsultantInvoicesModule,
    ApporteursModule,
    ReportingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
