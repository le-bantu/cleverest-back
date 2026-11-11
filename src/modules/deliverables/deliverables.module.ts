import { Module } from '@nestjs/common';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import { MissionsModule } from '@modules/missions/missions.module';
import { ContractsModule } from '@modules/contracts/contracts.module';
import { deliverablesInfrastructureProviders } from './infrastructure/deliverables.providers';
import { DeliverableCommitter } from './application/deliverable-services';
import {
  DownloadDeliverableUseCase,
  GetDeliverableUseCase,
  ListDeliverablesUseCase,
  UploadDeliverableUseCase,
  ValidateDeliverableAsAdminUseCase,
  ValidateDeliverableAsClientUseCase,
} from './application/use-cases/deliverables.use-cases';
import {
  AdminDeliverablesController,
  AdminDeliverablesReadController,
  ClientDeliverablesController,
  ClientDeliverablesReadController,
  ConsultantDeliverablesController,
  ConsultantDeliverablesReadController,
  DeliverablesController,
} from './interface/http/deliverables.controllers';

@Module({
  imports: [MissionsModule, ContractsModule],
  controllers: [
    DeliverablesController,
    ConsultantDeliverablesController,
    ConsultantDeliverablesReadController,
    ClientDeliverablesController,
    ClientDeliverablesReadController,
    AdminDeliverablesController,
    AdminDeliverablesReadController,
  ],
  providers: [
    ...deliverablesInfrastructureProviders,
    BestEffortNotifier,
    DeliverableCommitter,
    UploadDeliverableUseCase,
    ListDeliverablesUseCase,
    GetDeliverableUseCase,
    DownloadDeliverableUseCase,
    ValidateDeliverableAsAdminUseCase,
    ValidateDeliverableAsClientUseCase,
  ],
})
export class DeliverablesModule {}
