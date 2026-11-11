import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case';
import { MISSION_REPOSITORY, MissionRepository } from '../../domain';
import { MissionRef } from '../missions.dto';
import { ClientMissionView, MissionView } from '../mission.views';
import { loadVisibleMission, viewFor } from '../services/mission-access';

@Injectable()
export class GetMissionUseCase implements UseCase<MissionRef, MissionView | ClientMissionView> {
  constructor(@Inject(MISSION_REPOSITORY) private readonly missions: MissionRepository) {}

  async execute(input: MissionRef): Promise<MissionView | ClientMissionView> {
    const { by, mission } = await loadVisibleMission(this.missions, input.actor, input.missionId);
    return viewFor(by, mission);
  }
}
