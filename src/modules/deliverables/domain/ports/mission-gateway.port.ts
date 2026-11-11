/** The mission as the deliverables context needs to see it. */
export interface MissionForDeliverable {
  id: string;
  /** main quote the mission executes */
  quoteId: string;
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

/** PORT to the contracts context: the consultant ↔ Cleverest engagement. */
export abstract class ConsultantEngagementPort {
  /** has the consultant SIGNED their contract on this main quote (or one of its subquotes)? */
  abstract isEngaged(consultantId: string, quoteId: string): Promise<boolean>;
}

export const CONSULTANT_ENGAGEMENT = Symbol('DELIVERABLES_CONSULTANT_ENGAGEMENT');
