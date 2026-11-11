import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from '@shared/kernel';
import { MissionStatus } from './value-objects/mission-status.vo';

export const missionNotFound = (id: string): NotFoundException =>
  new NotFoundException('MISSION_NOT_FOUND', 'Mission not found', { id });

export const taskNotFound = (id: string): NotFoundException =>
  new NotFoundException('MISSION_TASK_NOT_FOUND', 'Task not found', { id });

/** 422 — a mission is opened from a signed contract only. */
export class MissionContractNotSigned extends ValidationException {
  constructor(contractId: string) {
    super('CONTRACT_NOT_SIGNED', 'The contract must be signed before opening a mission', {
      contractId,
    });
  }
}

/** 409 — status change outside the mission lifecycle. */
export class MissionTransitionNotAllowed extends ConflictException {
  constructor(from: MissionStatus, to: MissionStatus) {
    super('MISSION_TRANSITION_NOT_ALLOWED', `Transition ${from} → ${to} is not allowed`, {
      from,
      to,
    });
  }
}

/** 409 — progress is computed from the tasks as soon as there is one. */
export class ProgressComputedFromTasks extends ConflictException {
  constructor() {
    super(
      'PROGRESS_COMPUTED_FROM_TASKS',
      'This mission has tasks: its progress is computed from them',
    );
  }
}

export const leadRequired = (): ForbiddenException =>
  new ForbiddenException('MISSION_LEAD_REQUIRED', 'Only the lead consultant can do this');

export const notAssigned = (): ForbiddenException =>
  new ForbiddenException('MISSION_NOT_ASSIGNED', 'You are not assigned to this mission');

export const missionClosed = (status: MissionStatus): ConflictException =>
  new ConflictException('MISSION_CLOSED', `The mission is ${status}`, { status });

export const invalidMission = (code: string, message: string): ValidationException =>
  new ValidationException(code, message);

export const taskUpdateForbidden = (): ForbiddenException =>
  new ForbiddenException(
    'TASK_UPDATE_FORBIDDEN',
    'Only the lead can edit a task; an assignee may only change the status of their own task',
  );

export const missionNotInProgress = (status: MissionStatus): ConflictException =>
  new ConflictException('MISSION_NOT_IN_PROGRESS', `The mission is ${status}, not in progress`, {
    status,
  });
