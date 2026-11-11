import { Module } from '@nestjs/common';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import { QuotesModule } from '@modules/quotes/quotes.module';
import { ContractsModule } from '@modules/contracts/contracts.module';
import { missionsInfrastructureProviders } from './infrastructure/missions.providers';
import { MissionCommitter } from './application/services/mission-committer';
import { MissionsFacade } from './application/missions.facade';
import { CreateMissionUseCase } from './application/use-cases/create-mission.use-case';
import { ListMissionsUseCase } from './application/use-cases/list-missions.use-case';
import { GetMissionUseCase } from './application/use-cases/get-mission.use-case';
import { AssignMissionConsultantsUseCase } from './application/use-cases/assign-mission-consultants.use-case';
import { RespondToAssignmentUseCase } from './application/use-cases/respond-to-assignment.use-case';
import { UpdateMissionProgressUseCase } from './application/use-cases/update-mission-progress.use-case';
import { DownloadMissionContractUseCase } from './application/use-cases/download-mission-contract.use-case';
import {
  AddMissionTaskUseCase,
  DeleteMissionTaskUseCase,
  ListMissionTasksUseCase,
  ReorderMissionTasksUseCase,
  UpdateMissionTaskUseCase,
} from './application/use-cases/mission-tasks.use-cases';
import { MissionsController } from './interface/http/missions.controller';
import { MissionTasksController } from './interface/http/mission-tasks.controller';
import { ClientMissionsController } from './interface/http/client-missions.controller';
import { AdminMissionsController } from './interface/http/admin-missions.controller';

@Module({
  imports: [QuotesModule, ContractsModule],
  controllers: [
    AdminMissionsController,
    ClientMissionsController,
    MissionTasksController,
    MissionsController,
  ],
  providers: [
    ...missionsInfrastructureProviders,
    BestEffortNotifier,
    MissionCommitter,
    MissionsFacade,
    CreateMissionUseCase,
    ListMissionsUseCase,
    GetMissionUseCase,
    AssignMissionConsultantsUseCase,
    RespondToAssignmentUseCase,
    UpdateMissionProgressUseCase,
    DownloadMissionContractUseCase,
    ListMissionTasksUseCase,
    AddMissionTaskUseCase,
    UpdateMissionTaskUseCase,
    DeleteMissionTaskUseCase,
    ReorderMissionTasksUseCase,
  ],
  exports: [MissionsFacade],
})
export class MissionsModule {}
