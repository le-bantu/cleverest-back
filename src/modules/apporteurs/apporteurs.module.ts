import { Module } from '@nestjs/common';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import { IdentityAccessModule } from '@modules/identity-access/identity-access.module';
import { QuotesModule } from '@modules/quotes/quotes.module';
import { ContractsModule } from '@modules/contracts/contracts.module';
import { MissionsModule } from '@modules/missions/missions.module';
import { apporteursInfrastructureProviders } from './infrastructure/apporteurs.providers';
import {
  ApporteurCommitter,
  ConvertProspectUseCase,
  CreateProspectUseCase,
  DownloadProspectDocumentUseCase,
  GetCommissionUseCase,
  GetProspectUseCase,
  ListCommissionsUseCase,
  ListProspectsUseCase,
  RejectProspectUseCase,
  SetCommissionAmountUseCase,
  UpdateCommissionStatusUseCase,
  UploadProspectDocumentUseCase,
} from './application';
import {
  CommissionsAdminController,
  CommissionsApporteurController,
  ProspectsAdminController,
  ProspectsApporteurController,
} from './interface/http/apporteurs.controllers';

@Module({
  imports: [IdentityAccessModule, QuotesModule, ContractsModule, MissionsModule],
  controllers: [
    ProspectsApporteurController,
    ProspectsAdminController,
    CommissionsApporteurController,
    CommissionsAdminController,
  ],
  providers: [
    ...apporteursInfrastructureProviders,
    BestEffortNotifier,
    ApporteurCommitter,
    CreateProspectUseCase,
    ListProspectsUseCase,
    GetProspectUseCase,
    UploadProspectDocumentUseCase,
    DownloadProspectDocumentUseCase,
    RejectProspectUseCase,
    ConvertProspectUseCase,
    ListCommissionsUseCase,
    GetCommissionUseCase,
    UpdateCommissionStatusUseCase,
    SetCommissionAmountUseCase,
  ],
})
export class ApporteursModule {}
