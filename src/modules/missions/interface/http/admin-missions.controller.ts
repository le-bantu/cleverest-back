import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MAX_UPLOAD_BYTES } from '@shared/kernel';
import { Roles } from '@shared/interface/http/decorators/roles.decorator';
import { RequirePermissions } from '@shared/interface/http/decorators/require-permissions.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '@shared/interface/http/decorators/current-user.decorator';
import { actorOf, sendFile, toIncomingFile } from '@shared/interface/http/http-helpers';
import {
  AssignMissionConsultantsUseCase,
  CreateMissionUseCase,
  DownloadMissionContractUseCase,
  GetMissionUseCase,
  ListMissionsUseCase,
} from '../../application';
import {
  AssignMissionConsultantsRequest,
  CreateMissionRequest,
  ListMissionsQuery,
} from './dto/mission.request';

@ApiTags('missions (admin)')
@ApiBearerAuth()
@Controller('admin/missions')
@Roles('admin', 'superadmin')
export class AdminMissionsController {
  constructor(
    private readonly createMission: CreateMissionUseCase,
    private readonly listMissions: ListMissionsUseCase,
    private readonly getMission: GetMissionUseCase,
    private readonly assignConsultants: AssignMissionConsultantsUseCase,
    private readonly downloadContract: DownloadMissionContractUseCase,
  ) {}

  @Post()
  @HttpCode(201)
  @RequirePermissions('manage-quotes')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateMissionRequest })
  @UseInterceptors(FileInterceptor('contractMission', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  create(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: CreateMissionRequest,
  ) {
    return this.createMission.execute({
      actor: actorOf(user),
      contractId: body.contractId,
      title: body.title,
      description: body.description,
      deliveryDate: body.deliveryDate,
      contractFile: toIncomingFile(file, 'contractMission'),
    });
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMissionsQuery) {
    return this.listMissions.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getMission.execute({ actor: actorOf(user), missionId: id });
  }

  @Post(':id/assign')
  @HttpCode(200)
  @RequirePermissions('assign-consultants')
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AssignMissionConsultantsRequest,
  ) {
    return this.assignConsultants.execute({
      actor: actorOf(user),
      missionId: id,
      consultants: body.consultants,
    });
  }

  @Get(':id/download-contract')
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
