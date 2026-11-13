import { Module } from '@nestjs/common';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import { MissionsModule } from '@modules/missions/missions.module';
import { ContractsModule } from '@modules/contracts/contracts.module';
import { consultantInvoicesInfrastructureProviders } from './infrastructure/consultant-invoices.providers';
import {
  ConsultantInvoiceCommitter,
  DownloadConsultantInvoiceUseCase,
  ListConsultantInvoicesUseCase,
  MarkConsultantInvoicePaidUseCase,
  SubmitConsultantInvoiceUseCase,
} from './application';
import {
  ConsultantInvoicesAdminController,
  ConsultantInvoicesConsultantController,
} from './interface/http/consultant-invoices.controllers';

@Module({
  imports: [MissionsModule, ContractsModule],
  controllers: [ConsultantInvoicesConsultantController, ConsultantInvoicesAdminController],
  providers: [
    ...consultantInvoicesInfrastructureProviders,
    BestEffortNotifier,
    ConsultantInvoiceCommitter,
    SubmitConsultantInvoiceUseCase,
    ListConsultantInvoicesUseCase,
    DownloadConsultantInvoiceUseCase,
    MarkConsultantInvoicePaidUseCase,
  ],
})
export class ConsultantInvoicesModule {}
