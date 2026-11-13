/** The mission as the reviews context needs to see it. */
export interface MissionForReview {
  id: string;
  clientId: string;
  consultantIds: string[];
  /** status TERMINÉE */
  completed: boolean;
}

/** PORT to the missions context. */
export abstract class ReviewMissionGatewayPort {
  abstract findMission(missionId: string): Promise<MissionForReview | null>;
}

export const REVIEW_MISSION_GATEWAY = Symbol('REVIEWS_MISSION_GATEWAY');
