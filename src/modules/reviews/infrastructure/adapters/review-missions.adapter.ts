import { Injectable } from '@nestjs/common';
import { MissionsFacade } from '@modules/missions/application/missions.facade';
import { MissionStatus } from '@modules/missions/domain';
import { MissionForReview, ReviewMissionGatewayPort } from '../../domain';

/** Reviews → missions, through the missions public facade only. */
@Injectable()
export class ReviewMissionsGatewayAdapter extends ReviewMissionGatewayPort {
  constructor(private readonly missions: MissionsFacade) {
    super();
  }

  async findMission(missionId: string): Promise<MissionForReview | null> {
    const m = await this.missions.findSummary(missionId);
    return m
      ? {
          id: m.id,
          clientId: m.clientId,
          consultantIds: m.consultantIds,
          completed: m.status === (MissionStatus.TERMINEE as string),
        }
      : null;
  }
}
