import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG, AuditLogPort } from '@shared/application/ports/audit-log.port';
import { EVENT_BUS, EventBusPort } from '@shared/application/ports/event-bus.port';
import {
  MISSION_REVIEW_REPOSITORY,
  MissionReview,
  MissionReviewRepository,
  MissionReviewRevised,
  MissionReviewSubmitted,
} from '../domain';

/** Saves, audits and publishes the review's events. */
@Injectable()
export class MissionReviewCommitter {
  constructor(
    @Inject(MISSION_REVIEW_REPOSITORY) private readonly reviews: MissionReviewRepository,
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
  ) {}

  async commit(review: MissionReview): Promise<void> {
    await this.reviews.save(review);
    const events = review.pullDomainEvents();
    for (const event of events) {
      if (event instanceof MissionReviewSubmitted) {
        await this.audit.record({
          entity: 'MissionReview',
          entityId: review.id,
          action: 'CREATED',
          actorId: review.clientId,
          metadata: { missionId: review.missionId, rating: review.rating },
        });
      } else if (event instanceof MissionReviewRevised) {
        await this.audit.record({
          entity: 'MissionReview',
          entityId: review.id,
          action: 'UPDATED',
          actorId: review.clientId,
          metadata: {
            missionId: review.missionId,
            rating: review.rating,
            previousRating: event.data.previousRating,
          },
        });
      }
    }
    await this.events.publish(events);
  }
}
