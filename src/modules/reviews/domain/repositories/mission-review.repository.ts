import { MissionReview } from '../entities/mission-review.entity';

export const MISSION_REVIEW_REPOSITORY = Symbol('MISSION_REVIEW_REPOSITORY');

/** PORT. Listing goes through the application read model (it joins mission and client). */
export abstract class MissionReviewRepository {
  abstract nextIdentity(): string;
  abstract findById(id: string): Promise<MissionReview | null>;
  abstract findByMissionAndClient(
    missionId: string,
    clientId: string,
  ): Promise<MissionReview | null>;
  /**
   * Upsert on (missionId, clientId): a concurrent first submission for the same pair
   * updates the stored row instead of failing; read the review back for its stored id.
   */
  abstract save(review: MissionReview): Promise<void>;
}
