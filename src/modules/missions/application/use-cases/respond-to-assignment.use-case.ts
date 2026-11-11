import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, ValidationException } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { MISSION_REPOSITORY, MissionRepository } from '../../domain';
import { RespondToAssignmentInput } from '../missions.dto';
import { MissionView, toMissionView } from '../mission.views';
import { loadVisibleMission } from '../services/mission-access';
import { MissionCommitter } from '../services/mission-committer';

/** Lead consultant accepts (→ EN_COURS) or refuses (→ REJETÉE). */
@Injectable()
export class RespondToAssignmentUseCase implements UseCase<RespondToAssignmentInput, MissionView> {
  constructor(
    @Inject(MISSION_REPOSITORY) private readonly missions: MissionRepository,
    private readonly committer: MissionCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: RespondToAssignmentInput): Promise<MissionView> {
    if (input.action !== 'accept' && input.action !== 'refuse') {
      throw new ValidationException('INVALID_ACTION', 'action must be "accept" or "refuse"');
    }
    const { by, mission } = await loadVisibleMission(this.missions, input.actor, input.missionId, [
      'CONSULTANT',
    ]);
    mission.respondToAssignment(by.userId, input.action === 'accept', this.clock.now());
    await this.committer.commit(mission);
    return toMissionView(mission, by.userId);
  }
}
