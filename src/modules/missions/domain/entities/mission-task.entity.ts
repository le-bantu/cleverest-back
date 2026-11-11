import { AbstractEntity } from '@shared/kernel';
import { invalidMission } from '../errors';
import { MissionTaskStatus } from '../value-objects/mission-status.vo';

export const TASK_TITLE_MAX = 255;
export const TASK_DESCRIPTION_MAX = 5000;

export interface MissionTaskProps {
  id: string;
  missionId: string;
  title: string;
  description: string | null;
  /** 1-based position, contiguous within the mission */
  order: number;
  status: MissionTaskStatus;
  assigneeConsultantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const cleanTaskTitle = (title: string): string => {
  const value = title.trim();
  if (!value) throw invalidMission('TASK_TITLE_REQUIRED', 'A task needs a title');
  if (value.length > TASK_TITLE_MAX) {
    throw invalidMission('TASK_TITLE_TOO_LONG', `Title must be at most ${TASK_TITLE_MAX} chars`);
  }
  return value;
};

export const cleanTaskDescription = (description: string | null | undefined): string | null => {
  const value = description?.trim() ?? '';
  if (value.length > TASK_DESCRIPTION_MAX) {
    throw invalidMission('TASK_DESCRIPTION_TOO_LONG', 'Description is too long');
  }
  return value || null;
};

/** Entity of the Mission aggregate: only `Mission` creates or changes tasks. */
export class MissionTask extends AbstractEntity<string> {
  private props: MissionTaskProps;

  private constructor(props: MissionTaskProps) {
    super(props.id);
    this.props = props;
  }

  /** @internal used by Mission */
  static create(props: MissionTaskProps): MissionTask {
    return new MissionTask({
      ...props,
      title: cleanTaskTitle(props.title),
      description: cleanTaskDescription(props.description),
    });
  }

  static rehydrate(props: MissionTaskProps): MissionTask {
    return new MissionTask({ ...props });
  }

  get missionId(): string {
    return this.props.missionId;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | null {
    return this.props.description;
  }
  get order(): number {
    return this.props.order;
  }
  get status(): MissionTaskStatus {
    return this.props.status;
  }
  get assigneeConsultantId(): string | null {
    return this.props.assigneeConsultantId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get isDone(): boolean {
    return this.props.status === MissionTaskStatus.FAITE;
  }

  /** @internal mutations go through the Mission aggregate */
  apply(
    patch: Partial<
      Pick<MissionTaskProps, 'title' | 'description' | 'status' | 'assigneeConsultantId' | 'order'>
    >,
    now: Date,
  ): void {
    if (patch.title !== undefined) this.props.title = cleanTaskTitle(patch.title);
    if (patch.description !== undefined) {
      this.props.description = cleanTaskDescription(patch.description);
    }
    if (patch.status !== undefined) this.props.status = patch.status;
    if (patch.assigneeConsultantId !== undefined) {
      this.props.assigneeConsultantId = patch.assigneeConsultantId;
    }
    if (patch.order !== undefined) this.props.order = patch.order;
    this.props.updatedAt = now;
  }
}
