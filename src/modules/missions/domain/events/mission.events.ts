import { BaseDomainEvent } from '@shared/kernel';
import { MissionStatus } from '../value-objects/mission-status.vo';

export class MissionCreated extends BaseDomainEvent {
  readonly name = 'missions.mission-created';
  constructor(
    missionId: string,
    readonly data: { contractId: string; clientId: string; actorId: string | null },
    occurredAt?: Date,
  ) {
    super(missionId, data, occurredAt);
  }
}

export class MissionStatusChanged extends BaseDomainEvent {
  readonly name = 'missions.mission-status-changed';
  constructor(
    missionId: string,
    readonly data: {
      from: MissionStatus;
      to: MissionStatus;
      actorId: string;
      clientId: string;
    },
    occurredAt?: Date,
  ) {
    super(missionId, data, occurredAt);
  }
}

export class ConsultantsAssignedToMission extends BaseDomainEvent {
  readonly name = 'missions.consultants-assigned';
  constructor(
    missionId: string,
    readonly data: {
      consultantIds: string[];
      newlyAssignedIds: string[];
      leadId: string;
      actorId: string;
    },
    occurredAt?: Date,
  ) {
    super(missionId, data, occurredAt);
  }
}
