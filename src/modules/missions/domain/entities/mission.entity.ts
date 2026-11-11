import {
  AbstractAggregateRoot,
  assertFileAllowed,
  FilePolicy,
  MAX_UPLOAD_BYTES,
  StoredFileRef,
} from '@shared/kernel';
import {
  invalidMission,
  leadRequired,
  missionClosed,
  MissionContractNotSigned,
  missionNotInProgress,
  MissionTransitionNotAllowed,
  notAssigned,
  ProgressComputedFromTasks,
  taskNotFound,
  taskUpdateForbidden,
} from '../errors';
import {
  ConsultantsAssignedToMission,
  MissionCreated,
  MissionStatusChanged,
} from '../events/mission.events';
import { ContractForMission } from '../ports/contract-gateway.port';
import {
  MISSION_TRANSITIONS,
  MissionStatus,
  MissionTaskStatus,
} from '../value-objects/mission-status.vo';
import { MissionTask, MissionTaskProps } from './mission-task.entity';

export const MISSION_CONTRACT_FILE_POLICY: FilePolicy = {
  maxBytes: MAX_UPLOAD_BYTES,
  extensions: ['.pdf', '.doc', '.docx'],
};
export const MISSION_TITLE_MAX = 255;

export interface MissionAssignment {
  consultantId: string;
  isLead: boolean;
}

export type ProgressMode = 'TASKS' | 'MANUAL';

export interface MissionProps {
  id: string;
  contractId: string;
  /** captured from the contract at creation (ownership without cross-context joins) */
  quoteId: string;
  clientId: string;
  title: string;
  description: string | null;
  status: MissionStatus;
  /** 0-100; computed from the tasks as soon as there is one */
  progress: number;
  deliveryDate: Date | null;
  contractFile: StoredFileRef | null;
  consultants: MissionAssignment[];
  tasks: MissionTask[];
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewTaskInput {
  id: string;
  title: string;
  description?: string | null;
  /** 1-based position; appended when omitted */
  order?: number | null;
  assigneeConsultantId?: string | null;
}

export interface TaskPatch {
  title?: string;
  description?: string | null;
  order?: number;
  status?: MissionTaskStatus;
  assigneeConsultantId?: string | null;
}

const cleanTitle = (title: string): string => {
  const value = title.trim();
  if (!value) throw invalidMission('MISSION_TITLE_REQUIRED', 'A mission needs a title');
  if (value.length > MISSION_TITLE_MAX) {
    throw invalidMission('MISSION_TITLE_TOO_LONG', `Title must be at most ${MISSION_TITLE_MAX}`);
  }
  return value;
};

/**
 * A mission opened from a signed contract, staffed by consultants (one lead)
 * and optionally broken down into ordered tasks that drive its progress.
 */
export class Mission extends AbstractAggregateRoot<string> {
  private props: MissionProps;

  private constructor(props: MissionProps) {
    super(props.id);
    this.props = props;
  }

  static create(
    input: {
      id: string;
      contract: ContractForMission;
      title: string;
      description?: string | null;
      deliveryDate?: Date | null;
      contractFile: StoredFileRef | null;
      createdById: string;
    },
    now: Date,
  ): Mission {
    if (!input.contract.signed) throw new MissionContractNotSigned(input.contract.id);
    if (input.contractFile) assertFileAllowed(input.contractFile, MISSION_CONTRACT_FILE_POLICY);
    const mission = new Mission({
      id: input.id,
      contractId: input.contract.id,
      quoteId: input.contract.quoteId,
      clientId: input.contract.clientId,
      title: cleanTitle(input.title),
      description: input.description?.trim() || null,
      status: MissionStatus.EN_ATTENTE,
      progress: 0,
      deliveryDate: input.deliveryDate ?? null,
      contractFile: input.contractFile,
      consultants: [],
      tasks: [],
      createdById: input.createdById,
      createdAt: now,
      updatedAt: now,
    });
    mission.addDomainEvent(
      new MissionCreated(
        input.id,
        {
          contractId: input.contract.id,
          clientId: input.contract.clientId,
          actorId: input.createdById,
        },
        now,
      ),
    );
    return mission;
  }

  static rehydrate(props: MissionProps): Mission {
    return new Mission({
      ...props,
      consultants: props.consultants.map((c) => ({ ...c })),
      tasks: [...props.tasks].sort((a, b) => a.order - b.order),
    });
  }

  // ------------------------------------------------------------------ getters
  get contractId(): string {
    return this.props.contractId;
  }
  get quoteId(): string {
    return this.props.quoteId;
  }
  get clientId(): string {
    return this.props.clientId;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | null {
    return this.props.description;
  }
  get status(): MissionStatus {
    return this.props.status;
  }
  get progress(): number {
    return this.props.progress;
  }
  get progressMode(): ProgressMode {
    return this.props.tasks.length ? 'TASKS' : 'MANUAL';
  }
  get deliveryDate(): Date | null {
    return this.props.deliveryDate;
  }
  get contractFile(): StoredFileRef | null {
    return this.props.contractFile;
  }
  get consultants(): MissionAssignment[] {
    return this.props.consultants.map((c) => ({ ...c }));
  }
  get consultantIds(): string[] {
    return this.props.consultants.map((c) => c.consultantId);
  }
  get leadConsultantId(): string | null {
    return this.props.consultants.find((c) => c.isLead)?.consultantId ?? null;
  }
  /** ordered by `order` */
  get tasks(): readonly MissionTask[] {
    return this.props.tasks;
  }
  get createdById(): string | null {
    return this.props.createdById;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get isClosed(): boolean {
    return this.props.status === MissionStatus.TERMINEE;
  }

  isAssigned(consultantId: string): boolean {
    return this.props.consultants.some((c) => c.consultantId === consultantId);
  }
  isLead(consultantId: string): boolean {
    return this.leadConsultantId === consultantId;
  }
  isOwnedBy(clientId: string): boolean {
    return this.props.clientId === clientId;
  }

  // ---------------------------------------------------------------- staffing
  /**
   * Replaces the team (sync). Lead: explicit flag > current lead still on the
   * team > quote lead (if on the team) > first consultant. Re-staffing a
   * REJETÉE mission re-opens it (→ EN_ATTENTE).
   */
  assignConsultants(
    assignments: readonly MissionAssignment[],
    quoteLeadId: string | null,
    adminId: string,
    now: Date,
  ): void {
    if (this.isClosed) throw missionClosed(this.props.status);
    if (!assignments.length) {
      throw invalidMission('CONSULTANTS_REQUIRED', 'At least one consultant is required');
    }
    const ids = assignments.map((a) => a.consultantId);
    if (new Set(ids).size !== ids.length) {
      throw invalidMission('DUPLICATE_CONSULTANT', 'A consultant is listed twice');
    }
    const explicit = assignments.filter((a) => a.isLead);
    if (explicit.length > 1) {
      throw invalidMission('MULTIPLE_LEADS', 'A mission has at most one lead consultant');
    }
    const current = this.leadConsultantId;
    const leadId =
      explicit[0]?.consultantId ??
      (current && ids.includes(current) ? current : null) ??
      (quoteLeadId && ids.includes(quoteLeadId) ? quoteLeadId : null) ??
      ids[0];

    const before = new Set(this.consultantIds);
    this.props.consultants = ids.map((consultantId) => ({
      consultantId,
      isLead: consultantId === leadId,
    }));
    for (const task of this.props.tasks) {
      if (task.assigneeConsultantId && !ids.includes(task.assigneeConsultantId)) {
        task.apply({ assigneeConsultantId: null }, now);
      }
    }
    if (this.props.status === MissionStatus.REJETEE) {
      this.transitionTo(MissionStatus.EN_ATTENTE, adminId, now);
    }
    this.touch(now);
    this.addDomainEvent(
      new ConsultantsAssignedToMission(
        this.id,
        {
          consultantIds: ids,
          newlyAssignedIds: ids.filter((id) => !before.has(id)),
          leadId,
          actorId: adminId,
        },
        now,
      ),
    );
  }

  /** The lead accepts (→ EN_COURS) or refuses (→ REJETÉE) the mission. */
  respondToAssignment(consultantId: string, accept: boolean, now: Date): void {
    this.assertAssigned(consultantId);
    if (!this.isLead(consultantId)) throw leadRequired();
    this.transitionTo(accept ? MissionStatus.EN_COURS : MissionStatus.REJETEE, consultantId, now);
    this.touch(now);
  }

  // ---------------------------------------------------------------- progress
  /**
   * Assigned consultant reports progress and/or status. A manual `progress` is
   * refused (409) once the mission has tasks; TERMINÉE needs every task done.
   */
  updateProgress(
    consultantId: string,
    update: { progress?: number | null; status?: MissionStatus | null },
    now: Date,
  ): void {
    this.assertAssigned(consultantId);
    const hasProgress = update.progress !== undefined && update.progress !== null;
    const target = update.status ?? null;
    if (!hasProgress && !target) {
      throw invalidMission('NOTHING_TO_UPDATE', 'Provide a progress and/or a status');
    }
    if (!this.isInProgress()) throw missionNotInProgress(this.props.status);
    if (hasProgress) {
      if (this.props.tasks.length) throw new ProgressComputedFromTasks();
      const value = update.progress as number;
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        throw invalidMission('INVALID_PROGRESS', 'Progress is an integer between 0 and 100');
      }
    }
    if (target && target !== this.props.status) {
      if (target === MissionStatus.TERMINEE && this.props.tasks.some((t) => !t.isDone)) {
        throw invalidMission('TASKS_NOT_DONE', 'Every task must be done to close the mission');
      }
      this.transitionTo(target, consultantId, now);
    }
    if (hasProgress) this.props.progress = update.progress as number;
    if (this.props.status === MissionStatus.TERMINEE && !this.props.tasks.length) {
      this.props.progress = 100;
    }
    this.touch(now);
  }

  // ------------------------------------------------------------------- tasks
  addTask(leadId: string, input: NewTaskInput, now: Date): MissionTask {
    this.assertLeadOnOpenMission(leadId);
    this.assertAssignee(input.assigneeConsultantId);
    const task = MissionTask.create({
      id: input.id,
      missionId: this.id,
      title: input.title,
      description: input.description ?? null,
      order: this.props.tasks.length + 1,
      status: MissionTaskStatus.A_FAIRE,
      assigneeConsultantId: input.assigneeConsultantId ?? null,
      createdAt: now,
      updatedAt: now,
    });
    this.props.tasks.push(task);
    if (input.order !== undefined && input.order !== null) this.move(task, input.order, now);
    this.recomputeProgress();
    this.touch(now);
    return task;
  }

  /** Lead: any field. Another assigned consultant: only the status of their own task. */
  updateTask(consultantId: string, taskId: string, patch: TaskPatch, now: Date): MissionTask {
    this.assertAssigned(consultantId);
    if (this.isClosed) throw missionClosed(this.props.status);
    const task = this.findTask(taskId);
    if (!this.isLead(consultantId)) {
      const onlyStatus = Object.entries(patch).every(
        ([key, value]) => key === 'status' || value === undefined,
      );
      if (!onlyStatus || task.assigneeConsultantId !== consultantId) {
        throw taskUpdateForbidden();
      }
    }
    if (patch.assigneeConsultantId !== undefined) this.assertAssignee(patch.assigneeConsultantId);
    const { order, ...fields } = patch;
    task.apply(fields as Partial<MissionTaskProps>, now);
    if (order !== undefined) this.move(task, order, now);
    this.recomputeProgress();
    this.touch(now);
    return task;
  }

  deleteTask(leadId: string, taskId: string, now: Date): void {
    this.assertLeadOnOpenMission(leadId);
    const task = this.findTask(taskId);
    this.props.tasks = this.props.tasks.filter((t) => t !== task);
    this.renumber(now);
    this.recomputeProgress();
    this.touch(now);
  }

  /** `orderedTaskIds` must list every task exactly once. */
  reorderTasks(leadId: string, orderedTaskIds: readonly string[], now: Date): void {
    this.assertLeadOnOpenMission(leadId);
    const current = this.props.tasks.map((t) => t.id);
    const same =
      orderedTaskIds.length === current.length &&
      new Set(orderedTaskIds).size === current.length &&
      orderedTaskIds.every((id) => current.includes(id));
    if (!same) {
      throw invalidMission('INVALID_TASK_ORDER', 'orderedTaskIds must list every task once');
    }
    this.props.tasks = orderedTaskIds.map((id) => this.findTask(id));
    this.renumber(now);
    this.touch(now);
  }

  /** round(100 × done / total) when the mission has tasks; manual value otherwise. */
  recomputeProgress(): void {
    const total = this.props.tasks.length;
    if (!total) return;
    const done = this.props.tasks.filter((t) => t.isDone).length;
    this.props.progress = Math.round((100 * done) / total);
  }

  // ----------------------------------------------------------------- helpers
  private findTask(taskId: string): MissionTask {
    const task = this.props.tasks.find((t) => t.id === taskId);
    if (!task) throw taskNotFound(taskId);
    return task;
  }

  private move(task: MissionTask, order: number, now: Date): void {
    if (!Number.isInteger(order) || order < 1) {
      throw invalidMission('INVALID_TASK_ORDER', 'order is a positive integer');
    }
    const others = this.props.tasks.filter((t) => t !== task);
    const index = Math.min(order, others.length + 1) - 1;
    others.splice(index, 0, task);
    this.props.tasks = others;
    this.renumber(now);
  }

  private renumber(now: Date): void {
    this.props.tasks.forEach((t, i) => {
      if (t.order !== i + 1) t.apply({ order: i + 1 }, now);
    });
  }

  private assertAssigned(consultantId: string): void {
    if (!this.isAssigned(consultantId)) throw notAssigned();
  }

  private assertLeadOnOpenMission(consultantId: string): void {
    this.assertAssigned(consultantId);
    if (!this.isLead(consultantId)) throw leadRequired();
    if (this.isClosed || this.props.status === MissionStatus.REJETEE) {
      throw missionClosed(this.props.status);
    }
  }

  private assertAssignee(consultantId: string | null | undefined): void {
    if (consultantId && !this.isAssigned(consultantId)) {
      throw invalidMission('ASSIGNEE_NOT_ON_MISSION', 'The assignee must be on the mission');
    }
  }

  private isInProgress(): boolean {
    return (
      this.props.status === MissionStatus.EN_COURS ||
      this.props.status === MissionStatus.EN_VALIDATION
    );
  }

  private transitionTo(target: MissionStatus, actorId: string, now: Date): void {
    const from = this.props.status;
    if (!MISSION_TRANSITIONS[from].includes(target)) {
      throw new MissionTransitionNotAllowed(from, target);
    }
    this.props.status = target;
    this.addDomainEvent(
      new MissionStatusChanged(
        this.id,
        { from, to: target, actorId, clientId: this.props.clientId },
        now,
      ),
    );
  }

  private touch(now: Date): void {
    this.props.updatedAt = now;
  }
}
