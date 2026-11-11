import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, fileExtension, NotFoundException } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { requireAdminWith } from '@shared/application/actor';
import { FILE_STORAGE, FileStoragePort } from '@shared/application/ports/file-storage.port';
import { storeThenPersist, toStoredRef } from '@shared/application/files';
import {
  CONTRACT_GATEWAY,
  ContractGatewayPort,
  Mission,
  MISSION_REPOSITORY,
  MissionRepository,
} from '../../domain';
import { CreateMissionInput } from '../missions.dto';
import { MissionView, toMissionView } from '../mission.views';
import { MISSION_PERMISSIONS } from '../services/mission-access';
import { MissionCommitter } from '../services/mission-committer';

/** Admin (`manage-quotes`) opens a mission on a signed contract, with its mission contract file. */
@Injectable()
export class CreateMissionUseCase implements UseCase<CreateMissionInput, MissionView> {
  constructor(
    @Inject(MISSION_REPOSITORY) private readonly missions: MissionRepository,
    @Inject(CONTRACT_GATEWAY) private readonly contracts: ContractGatewayPort,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
    private readonly committer: MissionCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateMissionInput): Promise<MissionView> {
    const by = requireAdminWith(input.actor, MISSION_PERMISSIONS.MANAGE);
    const contract = await this.contracts.findContract(input.contractId);
    if (!contract) {
      throw new NotFoundException('CONTRACT_NOT_FOUND', 'Contract not found', {
        id: input.contractId,
      });
    }
    const id = this.missions.nextIdentity();
    const file = toStoredRef(
      `missions/${id}/contract${fileExtension(input.contractFile.originalName)}`,
      input.contractFile,
    );
    const mission = Mission.create(
      {
        id,
        contract,
        title: input.title,
        description: input.description,
        deliveryDate: input.deliveryDate,
        contractFile: file,
        createdById: by.userId,
      },
      this.clock.now(),
    );
    await storeThenPersist(this.storage, file, input.contractFile.buffer, () =>
      this.committer.commit(mission),
    );
    return toMissionView(mission);
  }
}
