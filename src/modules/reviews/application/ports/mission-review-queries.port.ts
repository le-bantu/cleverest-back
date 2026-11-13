import { Page, PageQuery } from '@shared/kernel';

export const MISSION_REVIEW_QUERIES = Symbol('MISSION_REVIEW_QUERIES');

export interface MissionReviewListFilter {
  missionId?: string;
  clientId?: string;
  minRating?: number;
  maxRating?: number;
}

/** Read model for the admin: the review with its mission and client. */
export interface MissionReviewDetails {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  mission: { id: string; title: string; status: string };
  client: { id: string; name: string | null; email: string | null };
}

/** PORT (query side): joins across contexts are a read concern, not a domain one. */
export abstract class MissionReviewQueriesPort {
  abstract findById(id: string): Promise<MissionReviewDetails | null>;
  abstract list(
    query: PageQuery,
    filter: MissionReviewListFilter,
  ): Promise<Page<MissionReviewDetails>>;
}
