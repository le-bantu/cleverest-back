import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@shared/interface/http/decorators/roles.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '@shared/interface/http/decorators/current-user.decorator';
import { actorOf } from '@shared/interface/http/http-helpers';
import {
  AddMissionTaskUseCase,
  DeleteMissionTaskUseCase,
  ListMissionTasksUseCase,
  ReorderMissionTasksUseCase,
  UpdateMissionTaskUseCase,
} from '../../application';
import {
  AddMissionTaskRequest,
  ReorderMissionTasksRequest,
  UpdateMissionTaskRequest,
} from './dto/mission.request';

/** Ordered tasks of a mission. Lead / assignee rules are enforced in the domain. */
@ApiTags('mission tasks')
@ApiBearerAuth()
@Controller('missions/:missionId/tasks')
export class MissionTasksController {
  constructor(
    private readonly listTasks: ListMissionTasksUseCase,
    private readonly addTask: AddMissionTaskUseCase,
    private readonly updateTask: UpdateMissionTaskUseCase,
    private readonly deleteTask: DeleteMissionTaskUseCase,
    private readonly reorderTasks: ReorderMissionTasksUseCase,
  ) {}

  @Get()
  @Roles('consultant', 'client', 'admin', 'superadmin')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('missionId', new ParseUUIDPipe()) missionId: string,
  ) {
    return this.listTasks.execute({ actor: actorOf(user), missionId });
  }

  @Post()
  @HttpCode(201)
  @Roles('consultant')
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('missionId', new ParseUUIDPipe()) missionId: string,
    @Body() body: AddMissionTaskRequest,
  ) {
    return this.addTask.execute({ actor: actorOf(user), missionId, ...body });
  }

  // declared before `:taskId` so "reorder" is never parsed as a task id
  @Patch('reorder')
  @Roles('consultant')
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('missionId', new ParseUUIDPipe()) missionId: string,
    @Body() body: ReorderMissionTasksRequest,
  ) {
    return this.reorderTasks.execute({
      actor: actorOf(user),
      missionId,
      orderedTaskIds: body.orderedTaskIds,
    });
  }

  @Patch(':taskId')
  @Roles('consultant')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('missionId', new ParseUUIDPipe()) missionId: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body() body: UpdateMissionTaskRequest,
  ) {
    return this.updateTask.execute({ actor: actorOf(user), missionId, taskId, ...body });
  }

  @Delete(':taskId')
  @HttpCode(204)
  @Roles('consultant')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('missionId', new ParseUUIDPipe()) missionId: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
  ) {
    await this.deleteTask.execute({ actor: actorOf(user), missionId, taskId });
  }
}
