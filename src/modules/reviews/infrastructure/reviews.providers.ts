import { Provider } from '@nestjs/common';
import { MISSION_REVIEW_REPOSITORY, REVIEW_MISSION_GATEWAY } from '../domain';
import { MISSION_REVIEW_QUERIES } from '../application/ports/mission-review-queries.port';
import {
  PrismaMissionReviewQueries,
  PrismaMissionReviewRepository,
} from './persistence/prisma-mission-review.repository';
import { ReviewMissionsGatewayAdapter } from './adapters/review-missions.adapter';

export const reviewsInfrastructureProviders: Provider[] = [
  PrismaMissionReviewRepository,
  PrismaMissionReviewQueries,
  ReviewMissionsGatewayAdapter,
  { provide: MISSION_REVIEW_REPOSITORY, useExisting: PrismaMissionReviewRepository },
  { provide: MISSION_REVIEW_QUERIES, useExisting: PrismaMissionReviewQueries },
  { provide: REVIEW_MISSION_GATEWAY, useExisting: ReviewMissionsGatewayAdapter },
];
