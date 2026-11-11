/** The mission as the deliverables context needs to see it. */
export interface MissionForDeliverable {
  id: string;
  clientId: string;
  consultantIds: string[];
  status: string;
  /** EN_COURS or EN_VALIDATION */
  active: boolean;
}

/** PORT to the missions context. */
export abstract class MissionGatewayPort {
  abstract findMission(missionId: string): Promise<MissionForDeliverable | null>;
}

export const MISSION_GATEWAY = Symbol('DELIVERABLES_MISSION_GATEWAY');
