import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { FILE_STORAGE, FileStoragePort } from '@shared/application/ports/file-storage.port';
import { download, DownloadedFile } from '@shared/application/files';
import { MISSION_REPOSITORY, MissionRepository } from '../../domain';
import { MissionRef } from '../missions.dto';
import { loadVisibleMission } from '../services/mission-access';

/** The mission contract file, for an assigned consultant or an admin. */
@Injectable()
export class DownloadMissionContractUseCase implements UseCase<MissionRef, DownloadedFile> {
  constructor(
    @Inject(MISSION_REPOSITORY) private readonly missions: MissionRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
  ) {}

  async execute(input: MissionRef): Promise<DownloadedFile> {
    const { mission } = await loadVisibleMission(this.missions, input.actor, input.missionId, [
      'ADMIN',
      'CONSULTANT',
    ]);
    if (!mission.contractFile) {
      throw new NotFoundException('MISSION_CONTRACT_NOT_FOUND', 'No contract file for mission', {
        id: mission.id,
      });
    }
    return download(this.storage, mission.contractFile);
  }
}
