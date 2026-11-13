import { Injectable } from '@nestjs/common';
import { MissionsFacade } from '@modules/missions/application/missions.facade';
import { MissionForPayment, PaymentMissionGatewayPort } from '../../domain';

/** Payments → missions, through the missions public facade only. */
@Injectable()
export class PaymentMissionsGatewayAdapter extends PaymentMissionGatewayPort {
  constructor(private readonly missions: MissionsFacade) {
    super();
  }

  async findMission(missionId: string): Promise<MissionForPayment | null> {
    const m = await this.missions.findSummary(missionId);
    return m
      ? { id: m.id, clientId: m.clientId, title: m.title, consultantIds: m.consultantIds }
      : null;
  }

  missionIdsForConsultant(consultantId: string): Promise<string[]> {
    return this.missions.missionIdsForConsultant(consultantId);
  }
}
