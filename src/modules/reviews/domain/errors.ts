import { NotFoundException, ValidationException } from '@shared/kernel';

export const MAX_REVIEW_COMMENT_LENGTH = 2000;

export const missionReviewNotFound = (id: string): NotFoundException =>
  new NotFoundException('MISSION_REVIEW_NOT_FOUND', 'Review not found', { id });

/** also used when the mission belongs to another client (no existence leak) */
export const reviewMissionNotFound = (id: string): NotFoundException =>
  new NotFoundException('MISSION_NOT_FOUND', 'Mission not found', { id });

export const missionNotCompleted = (id: string): ValidationException =>
  new ValidationException('MISSION_NOT_COMPLETED', 'Only a completed mission can be reviewed', {
    id,
  });

export const invalidRating = (rating: number): ValidationException =>
  new ValidationException('INVALID_RATING', 'The rating must be an integer between 1 and 5', {
    rating,
  });

export const reviewCommentTooLong = (): ValidationException =>
  new ValidationException(
    'REVIEW_COMMENT_TOO_LONG',
    `The comment exceeds ${MAX_REVIEW_COMMENT_LENGTH} characters`,
    { max: MAX_REVIEW_COMMENT_LENGTH },
  );
