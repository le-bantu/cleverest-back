import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@shared/interface/http/decorators/roles.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '@shared/interface/http/decorators/current-user.decorator';
import { actorOf } from '@shared/interface/http/http-helpers';
import { GetMissionUseCase, ListMissionsUseCase } from '../../application';
import { ListMissionsQuery } from './dto/mission.request';

/** `/client/missions` — missions of the client's quotes (no consultant detail). */
@ApiTags('missions (client)')
@ApiBearerAuth()
@Controller('client/missions')
@Roles('client')
export class ClientMissionsController {
  constructor(
    private readonly listMissions: ListMissionsUseCase,
    private readonly getMission: GetMissionUseCase,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMissionsQuery) {
    return this.listMissions.execute({ actor: actorOf(user), ...query });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.getMission.execute({ actor: actorOf(user), missionId: id });
  }
}
