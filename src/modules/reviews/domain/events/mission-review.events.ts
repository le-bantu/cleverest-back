import { BaseDomainEvent } from '@shared/kernel';

export class MissionReviewSubmitted extends BaseDomainEvent {
  readonly name = 'reviews.submitted';
  constructor(
    reviewId: string,
    readonly data: { missionId: string; clientId: string; rating: number },
    occurredAt?: Date,
  ) {
    super(reviewId, data, occurredAt);
  }
}

export class MissionReviewRevised extends BaseDomainEvent {
  readonly name = 'reviews.revised';
  constructor(
    reviewId: string,
    readonly data: { missionId: string; clientId: string; rating: number; previousRating: number },
    occurredAt?: Date,
  ) {
    super(reviewId, data, occurredAt);
  }
}
