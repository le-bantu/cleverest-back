import { PageQuery } from '@shared/kernel';
import { ActorContext } from '@shared/application/use-case';
import { MissionReview } from '../domain';

export interface SubmitMissionReviewInput {
  actor: ActorContext;
  missionId: string;
  rating: number;
  comment?: string | null;
}

export interface MissionReviewOfMissionInput {
  actor: ActorContext;
  missionId: string;
}

export interface MissionReviewRef {
  actor: ActorContext;
  reviewId: string;
}

export interface ListMissionReviewsInput extends Partial<PageQuery> {
  actor: ActorContext;
  missionId?: string;
  clientId?: string;
  minRating?: number;
  maxRating?: number;
}

export interface MissionReviewView {
  id: string;
  missionId: string;
  clientId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** `created` tells the HTTP layer whether the upsert created (201) or updated (200). */
export interface SubmittedMissionReview {
  review: MissionReviewView;
  created: boolean;
}

export const toMissionReviewView = (r: MissionReview): MissionReviewView => ({
  id: r.id,
  missionId: r.missionId,
  clientId: r.clientId,
  rating: r.rating,
  comment: r.comment,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});
