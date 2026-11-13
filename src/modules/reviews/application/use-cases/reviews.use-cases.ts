import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, normalizePageQuery, Page } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { resolveActor } from '@shared/application/actor';
import {
  canViewMissionReview,
  MISSION_REVIEW_REPOSITORY,
  MissionReview,
  missionReviewNotFound,
  MissionReviewRepository,
  REVIEW_MISSION_GATEWAY,
  ReviewMissionGatewayPort,
  reviewMissionNotFound,
} from '../../domain';
import {
  MISSION_REVIEW_QUERIES,
  MissionReviewDetails,
  MissionReviewQueriesPort,
} from '../ports/mission-review-queries.port';
import {
  ListMissionReviewsInput,
  MissionReviewOfMissionInput,
  MissionReviewRef,
  MissionReviewView,
  SubmitMissionReviewInput,
  SubmittedMissionReview,
  toMissionReviewView,
} from '../reviews.dto';
import { MissionReviewCommitter } from '../review-services';

/** The client of a TERMINÉE mission rates it; a second submission updates the review. */
@Injectable()
export class SubmitMissionReviewUseCase implements UseCase<
  SubmitMissionReviewInput,
  SubmittedMissionReview
> {
  constructor(
    @Inject(MISSION_REVIEW_REPOSITORY) private readonly reviews: MissionReviewRepository,
    @Inject(REVIEW_MISSION_GATEWAY) private readonly missions: ReviewMissionGatewayPort,
    private readonly committer: MissionReviewCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: SubmitMissionReviewInput): Promise<SubmittedMissionReview> {
    const by = resolveActor(input.actor, ['CLIENT']);
    const mission = await this.missions.findMission(input.missionId);
    if (!mission) throw reviewMissionNotFound(input.missionId);
    const now = this.clock.now();
    const values = {
      mission,
      clientId: by.userId,
      rating: input.rating,
      comment: input.comment,
    };
    const existing = await this.reviews.findByMissionAndClient(mission.id, by.userId);
    let review: MissionReview;
    if (existing) {
      existing.revise(values, now);
      review = existing;
    } else {
      review = MissionReview.submit({ id: this.reviews.nextIdentity(), ...values }, now);
    }
    await this.committer.commit(review);
    // read back: a concurrent first submission may own the stored row
    const stored = await this.reviews.findByMissionAndClient(mission.id, by.userId);
    return { review: toMissionReviewView(stored ?? review), created: !existing };
  }
}

/** The review of a mission, for its client, its consultants or an admin. */
@Injectable()
export class GetMissionReviewUseCase implements UseCase<
  MissionReviewOfMissionInput,
  MissionReviewView
> {
  constructor(
    @Inject(MISSION_REVIEW_REPOSITORY) private readonly reviews: MissionReviewRepository,
    @Inject(REVIEW_MISSION_GATEWAY) private readonly missions: ReviewMissionGatewayPort,
  ) {}

  async execute(input: MissionReviewOfMissionInput): Promise<MissionReviewView> {
    const by = resolveActor(input.actor, ['ADMIN', 'CLIENT', 'CONSULTANT']);
    const mission = await this.missions.findMission(input.missionId);
    if (!mission || !canViewMissionReview(by, mission))
      throw reviewMissionNotFound(input.missionId);
    const review = await this.reviews.findByMissionAndClient(mission.id, mission.clientId);
    if (!review) throw missionReviewNotFound(input.missionId);
    return toMissionReviewView(review);
  }
}

/** Admin: every review with its mission and client. */
@Injectable()
export class ListMissionReviewsUseCase implements UseCase<
  ListMissionReviewsInput,
  Page<MissionReviewDetails>
> {
  constructor(@Inject(MISSION_REVIEW_QUERIES) private readonly queries: MissionReviewQueriesPort) {}

  async execute(input: ListMissionReviewsInput): Promise<Page<MissionReviewDetails>> {
    resolveActor(input.actor, ['ADMIN']);
    return this.queries.list(normalizePageQuery(input), {
      missionId: input.missionId,
      clientId: input.clientId,
      minRating: input.minRating,
      maxRating: input.maxRating,
    });
  }
}

/** Admin: one review with its mission and client. */
@Injectable()
export class GetMissionReviewDetailsUseCase implements UseCase<
  MissionReviewRef,
  MissionReviewDetails
> {
  constructor(@Inject(MISSION_REVIEW_QUERIES) private readonly queries: MissionReviewQueriesPort) {}

  async execute(input: MissionReviewRef): Promise<MissionReviewDetails> {
    resolveActor(input.actor, ['ADMIN']);
    const details = await this.queries.findById(input.reviewId);
    if (!details) throw missionReviewNotFound(input.reviewId);
    return details;
  }
}
