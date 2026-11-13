import { AbstractAggregateRoot } from '@shared/kernel';
import {
  invalidRating,
  MAX_REVIEW_COMMENT_LENGTH,
  missionNotCompleted,
  reviewCommentTooLong,
  reviewMissionNotFound,
} from '../errors';
import { MissionReviewRevised, MissionReviewSubmitted } from '../events/mission-review.events';
import { MissionForReview } from '../ports/review-missions.port';

export const MIN_RATING = 1;
export const MAX_RATING = 5;

/** Who looks at a review (structurally the shared `ActorRef`). */
export interface ReviewViewer {
  userId: string;
  kind: 'ADMIN' | 'CONSULTANT' | 'CLIENT' | 'APPORTEUR';
}

export interface MissionReviewProps {
  id: string;
  missionId: string;
  clientId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const checkRating = (rating: number): number => {
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING)
    throw invalidRating(rating);
  return rating;
};

/** trimmed; blank = no comment */
const checkComment = (comment: string | null | undefined): string | null => {
  const text = comment?.trim() ?? '';
  if (text.length > MAX_REVIEW_COMMENT_LENGTH) throw reviewCommentTooLong();
  return text === '' ? null : text;
};

/** The client may only review their own mission once it is TERMINÉE. */
const assertReviewable = (mission: MissionForReview, clientId: string): void => {
  if (mission.clientId !== clientId) throw reviewMissionNotFound(mission.id);
  if (!mission.completed) throw missionNotCompleted(mission.id);
};

/**
 * Who may read the review of a mission: an admin, the mission's client, or a consultant
 * of the mission. Anyone else must not learn the mission exists.
 */
export const canViewMissionReview = (
  viewer: ReviewViewer,
  mission: Pick<MissionForReview, 'clientId' | 'consultantIds'>,
): boolean => {
  if (viewer.kind === 'ADMIN') return true;
  if (viewer.kind === 'CLIENT') return viewer.userId === mission.clientId;
  if (viewer.kind === 'CONSULTANT') return mission.consultantIds.includes(viewer.userId);
  return false;
};

/** A client's rating (1-5) of a completed mission; one per (mission, client). */
export class MissionReview extends AbstractAggregateRoot<string> {
  private props: MissionReviewProps;

  private constructor(props: MissionReviewProps) {
    super(props.id);
    this.props = props;
  }

  static submit(
    input: {
      id: string;
      mission: MissionForReview;
      clientId: string;
      rating: number;
      comment?: string | null;
    },
    now: Date,
  ): MissionReview {
    assertReviewable(input.mission, input.clientId);
    const review = new MissionReview({
      id: input.id,
      missionId: input.mission.id,
      clientId: input.clientId,
      rating: checkRating(input.rating),
      comment: checkComment(input.comment),
      createdAt: now,
      updatedAt: now,
    });
    review.addDomainEvent(
      new MissionReviewSubmitted(
        review.id,
        { missionId: review.missionId, clientId: review.clientId, rating: review.rating },
        now,
      ),
    );
    return review;
  }

  static rehydrate(props: MissionReviewProps): MissionReview {
    return new MissionReview({ ...props });
  }

  get missionId(): string {
    return this.props.missionId;
  }
  get clientId(): string {
    return this.props.clientId;
  }
  get rating(): number {
    return this.props.rating;
  }
  get comment(): string | null {
    return this.props.comment;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** The second submission of the same client updates the review (the comment is replaced). */
  revise(
    input: { mission: MissionForReview; clientId: string; rating: number; comment?: string | null },
    now: Date,
  ): void {
    if (input.mission.id !== this.props.missionId || input.clientId !== this.props.clientId)
      throw reviewMissionNotFound(input.mission.id);
    assertReviewable(input.mission, input.clientId);
    const previousRating = this.props.rating;
    this.props.rating = checkRating(input.rating);
    this.props.comment = checkComment(input.comment);
    this.props.updatedAt = now;
    this.addDomainEvent(
      new MissionReviewRevised(
        this.id,
        {
          missionId: this.props.missionId,
          clientId: this.props.clientId,
          rating: this.props.rating,
          previousRating,
        },
        now,
      ),
    );
  }
}
