import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '@shared/interface/http/decorators/roles.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '@shared/interface/http/decorators/current-user.decorator';
import { actorOf, sendFile } from '@shared/interface/http/http-helpers';
import {
  DownloadMissionContractUseCase,
  GetMissionUseCase,
  ListMissionsUseCase,
  RespondToAssignmentUseCase,
  UpdateMissionProgressUseCase,
} from '../../application';
import {
  ListMissionsQuery,
  RespondToAssignmentRequest,
  UpdateMissionProgressRequest,
} from './dto/mission.request';

/** `/missions` — the consultant's missions (GET one / download also open to admins). */
@ApiTags('missions (consultant)')
@ApiBearerAuth()
@Controller('missions')
export class MissionsController {
  constructor(
    private readonly listMissions: ListMissionsUseCase,
    private readonly getMission: GetMissionUseCase,
    private readonly respond: RespondToAssignmentUseCase,
    private readonly updateProgress: UpdateMissionProgressUseCase,
    private readonly downloadContract: DownloadMissionContractUseCase,
  ) {}

  @Get()
  @Roles('consultant')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMissionsQuery) {
    return this.listMissions.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id')
  @Roles('consultant', 'admin', 'superadmin')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getMission.execute({ actor: actorOf(user), missionId: id });
  }

  @Post(':id/respond')
  @HttpCode(200)
  @Roles('consultant')
  respondTo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RespondToAssignmentRequest,
  ) {
    return this.respond.execute({ actor: actorOf(user), missionId: id, action: body.action });
  }

  @Patch(':id/progress')
  @Roles('consultant')
  progress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateMissionProgressRequest,
  ) {
    return this.updateProgress.execute({ actor: actorOf(user), missionId: id, ...body });
  }

  @Get(':id/download-contract')
  @Roles('consultant', 'admin', 'superadmin')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return sendFile(
      res,
      await this.downloadContract.execute({ actor: actorOf(user), missionId: id }),
    );
  }
}
