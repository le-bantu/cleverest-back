import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { MISSION_REPOSITORY, MissionRepository, parseMissionStatus } from '../../domain';
import { UpdateMissionProgressInput } from '../missions.dto';
import { MissionView, toMissionView } from '../mission.views';
import { loadVisibleMission } from '../services/mission-access';
import { MissionCommitter } from '../services/mission-committer';

/** Assigned consultant: manual progress (only without tasks) and/or status. */
@Injectable()
export class UpdateMissionProgressUseCase implements UseCase<
  UpdateMissionProgressInput,
  MissionView
> {
  constructor(
    @Inject(MISSION_REPOSITORY) private readonly missions: MissionRepository,
    private readonly committer: MissionCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: UpdateMissionProgressInput): Promise<MissionView> {
    const { by, mission } = await loadVisibleMission(this.missions, input.actor, input.missionId, [
      'CONSULTANT',
    ]);
    mission.updateProgress(
      by.userId,
      {
        progress: input.progress,
        status: input.status ? parseMissionStatus(input.status) : null,
      },
      this.clock.now(),
    );
    await this.committer.commit(mission);
    return toMissionView(mission, by.userId);
  }
}
