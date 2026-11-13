import { Module } from '@nestjs/common';
import { MissionsModule } from '@modules/missions/missions.module';
import { reviewsInfrastructureProviders } from './infrastructure/reviews.providers';
import {
  GetMissionReviewDetailsUseCase,
  GetMissionReviewUseCase,
  ListMissionReviewsUseCase,
  MissionReviewCommitter,
  SubmitMissionReviewUseCase,
} from './application';
import {
  ReviewsAdminController,
  ReviewsClientController,
} from './interface/http/reviews.controllers';

@Module({
  imports: [MissionsModule],
  controllers: [ReviewsClientController, ReviewsAdminController],
  providers: [
    ...reviewsInfrastructureProviders,
    MissionReviewCommitter,
    SubmitMissionReviewUseCase,
    GetMissionReviewUseCase,
    ListMissionReviewsUseCase,
    GetMissionReviewDetailsUseCase,
  ],
})
export class ReviewsModule {}
