import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '@shared/interface/http/decorators/roles.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '@shared/interface/http/decorators/current-user.decorator';
import { actorOf } from '@shared/interface/http/http-helpers';
import {
  GetMissionReviewDetailsUseCase,
  GetMissionReviewUseCase,
  ListMissionReviewsUseCase,
  SubmitMissionReviewUseCase,
} from '../../application';
import { ListMissionReviewsQuery, SubmitMissionReviewRequest } from './dto/review.request';

/** `/reviews` — the client rates a completed mission. */
@ApiTags('reviews')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewsClientController {
  constructor(
    private readonly submitReview: SubmitMissionReviewUseCase,
    private readonly getReview: GetMissionReviewUseCase,
  ) {}

  /** Upsert: 201 when the review is created, 200 when it is updated. */
  @Post()
  @Roles('client')
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SubmitMissionReviewRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { review, created } = await this.submitReview.execute({
      actor: actorOf(user),
      missionId: body.missionId,
      rating: body.rating,
      comment: body.comment,
    });
    res.status(created ? 201 : 200);
    return review;
  }

  @Get('missions/:missionId')
  @Roles('client', 'consultant', 'admin', 'superadmin')
  ofMission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('missionId', new ParseUUIDPipe()) missionId: string,
  ) {
    return this.getReview.execute({ actor: actorOf(user), missionId });
  }
}

@ApiTags('reviews (admin)')
@ApiBearerAuth()
@Controller('admin/reviews')
@Roles('admin', 'superadmin')
export class ReviewsAdminController {
  constructor(
    private readonly listReviews: ListMissionReviewsUseCase,
    private readonly getDetails: GetMissionReviewDetailsUseCase,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMissionReviewsQuery) {
    return this.listReviews.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getDetails.execute({ actor: actorOf(user), reviewId: id });
  }
}
