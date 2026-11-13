import { Module } from '@nestjs/common';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import { MissionsModule } from '@modules/missions/missions.module';
import { paymentsInfrastructureProviders } from './infrastructure/payments.providers';
import {
  DownloadClientInvoiceUseCase,
  DownloadPaymentProofUseCase,
  GenerateClientInvoiceUseCase,
  GetPaymentUseCase,
  ListClientInvoicesUseCase,
  ListPaymentsUseCase,
  PaymentCommitter,
  SendClientInvoiceUseCase,
  SubmitPaymentUseCase,
  ValidatePaymentUseCase,
} from './application';
import {
  ClientInvoicesAdminController,
  ClientInvoicesController,
  PaymentsAdminController,
  PaymentsClientController,
  PaymentsConsultantController,
} from './interface/http/payments.controllers';

@Module({
  imports: [MissionsModule],
  controllers: [
    PaymentsClientController,
    PaymentsConsultantController,
    PaymentsAdminController,
    ClientInvoicesAdminController,
    ClientInvoicesController,
  ],
  providers: [
    ...paymentsInfrastructureProviders,
    BestEffortNotifier,
    PaymentCommitter,
    SubmitPaymentUseCase,
    ListPaymentsUseCase,
    GetPaymentUseCase,
    DownloadPaymentProofUseCase,
    ValidatePaymentUseCase,
    GenerateClientInvoiceUseCase,
    SendClientInvoiceUseCase,
    ListClientInvoicesUseCase,
    DownloadClientInvoiceUseCase,
  ],
})
export class PaymentsModule {}
