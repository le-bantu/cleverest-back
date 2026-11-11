import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, ValidationException } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { requireAdminWith } from '@shared/application/actor';
import { MISSION_REPOSITORY, MissionRepository, QUOTE_TEAM, QuoteTeamPort } from '../../domain';
import { AssignMissionConsultantsInput } from '../missions.dto';
import { MissionView, toMissionView } from '../mission.views';
import { loadMission, MISSION_PERMISSIONS } from '../services/mission-access';
import { MissionCommitter } from '../services/mission-committer';

/** Admin (`assign-consultants`) staffs the mission; the lead defaults to the quote's lead. */
@Injectable()
export class AssignMissionConsultantsUseCase implements UseCase<
  AssignMissionConsultantsInput,
  MissionView
> {
  constructor(
    @Inject(MISSION_REPOSITORY) private readonly missions: MissionRepository,
    @Inject(QUOTE_TEAM) private readonly team: QuoteTeamPort,
    private readonly committer: MissionCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: AssignMissionConsultantsInput): Promise<MissionView> {
    const by = requireAdminWith(input.actor, MISSION_PERMISSIONS.ASSIGN);
    const mission = await loadMission(this.missions, input.missionId);
    const ids = input.consultants.map((c) => c.id);
    const known = new Set(await this.team.existingConsultants(ids));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length) {
      throw new ValidationException('UNKNOWN_CONSULTANT', 'Unknown or inactive consultant', {
        ids: unknown,
      });
    }
    mission.assignConsultants(
      input.consultants.map((c) => ({ consultantId: c.id, isLead: c.isLead ?? false })),
      await this.team.leadConsultantOf(mission.quoteId),
      by.userId,
      this.clock.now(),
    );
    await this.committer.commit(mission);
    return toMissionView(mission);
  }
}
