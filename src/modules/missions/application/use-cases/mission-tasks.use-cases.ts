import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, generateUuid } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { MISSION_REPOSITORY, MissionRepository, parseTaskStatus } from '../../domain';
import {
  AddMissionTaskInput,
  MissionRef,
  MissionTaskRef,
  ReorderMissionTasksInput,
  UpdateMissionTaskInput,
} from '../missions.dto';
import { TaskView, toTaskView } from '../mission.views';
import { loadVisibleMission } from '../services/mission-access';
import { MissionCommitter } from '../services/mission-committer';

/** Ordered tasks: assigned consultant, admin, or the owning client. */
@Injectable()
export class ListMissionTasksUseCase implements UseCase<MissionRef, TaskView[]> {
  constructor(@Inject(MISSION_REPOSITORY) private readonly missions: MissionRepository) {}

  async execute(input: MissionRef): Promise<TaskView[]> {
    const { mission } = await loadVisibleMission(this.missions, input.actor, input.missionId);
    return mission.tasks.map(toTaskView);
  }
}

abstract class TaskCommand<I extends MissionRef, O> implements UseCase<I, O> {
  constructor(
    protected readonly missions: MissionRepository,
    protected readonly committer: MissionCommitter,
    protected readonly clock: Clock,
  ) {}

  protected load(input: MissionRef) {
    return loadVisibleMission(this.missions, input.actor, input.missionId, ['CONSULTANT']);
  }

  abstract execute(input: I): Promise<O>;
}

/** Lead consultant adds a task (progress becomes task-driven). */
@Injectable()
export class AddMissionTaskUseCase extends TaskCommand<AddMissionTaskInput, TaskView> {
  constructor(
    @Inject(MISSION_REPOSITORY) missions: MissionRepository,
    committer: MissionCommitter,
    @Inject(CLOCK) clock: Clock,
  ) {
    super(missions, committer, clock);
  }

  async execute(input: AddMissionTaskInput): Promise<TaskView> {
    const { by, mission } = await this.load(input);
    const task = mission.addTask(
      by.userId,
      {
        id: generateUuid(),
        title: input.title,
        description: input.description,
        order: input.order,
        assigneeConsultantId: input.assigneeConsultantId,
      },
      this.clock.now(),
    );
    await this.committer.commit(mission);
    return toTaskView(task);
  }
}

/** Lead: any field; assignee: status of their own task. Recomputes progress. */
@Injectable()
export class UpdateMissionTaskUseCase extends TaskCommand<UpdateMissionTaskInput, TaskView> {
  constructor(
    @Inject(MISSION_REPOSITORY) missions: MissionRepository,
    committer: MissionCommitter,
    @Inject(CLOCK) clock: Clock,
  ) {
    super(missions, committer, clock);
  }

  async execute(input: UpdateMissionTaskInput): Promise<TaskView> {
    const { by, mission } = await this.load(input);
    const task = mission.updateTask(
      by.userId,
      input.taskId,
      {
        title: input.title,
        description: input.description,
        order: input.order,
        status: input.status ? parseTaskStatus(input.status) : undefined,
        assigneeConsultantId: input.assigneeConsultantId,
      },
      this.clock.now(),
    );
    await this.committer.commit(mission);
    return toTaskView(task);
  }
}

@Injectable()
export class DeleteMissionTaskUseCase extends TaskCommand<MissionTaskRef, void> {
  constructor(
    @Inject(MISSION_REPOSITORY) missions: MissionRepository,
    committer: MissionCommitter,
    @Inject(CLOCK) clock: Clock,
  ) {
    super(missions, committer, clock);
  }

  async execute(input: MissionTaskRef): Promise<void> {
    const { by, mission } = await this.load(input);
    mission.deleteTask(by.userId, input.taskId, this.clock.now());
    await this.committer.commit(mission);
  }
}

@Injectable()
export class ReorderMissionTasksUseCase extends TaskCommand<ReorderMissionTasksInput, TaskView[]> {
  constructor(
    @Inject(MISSION_REPOSITORY) missions: MissionRepository,
    committer: MissionCommitter,
    @Inject(CLOCK) clock: Clock,
  ) {
    super(missions, committer, clock);
  }

  async execute(input: ReorderMissionTasksInput): Promise<TaskView[]> {
    const { by, mission } = await this.load(input);
    mission.reorderTasks(by.userId, input.orderedTaskIds, this.clock.now());
    await this.committer.commit(mission);
    return mission.tasks.map(toTaskView);
  }
}
