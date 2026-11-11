import { Injectable } from '@nestjs/common';
import { MissionsFacade } from '@modules/missions/application/missions.facade';
import { MissionForDeliverable, MissionGatewayPort } from '../../domain';

/** Deliverables → missions, through the missions public facade only. */
@Injectable()
export class MissionsGatewayAdapter extends MissionGatewayPort {
  constructor(private readonly missions: MissionsFacade) {
    super();
  }

  findMission(missionId: string): Promise<MissionForDeliverable | null> {
    return this.missions.findSummary(missionId);
  }
}
