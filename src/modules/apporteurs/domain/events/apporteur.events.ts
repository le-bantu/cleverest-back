import { BaseDomainEvent } from '@shared/kernel';

export class ProspectCreated extends BaseDomainEvent {
  readonly name = 'apporteurs.prospect-created';
  constructor(
    id: string,
    readonly data: { apporteurId: string },
    occurredAt?: Date,
  ) {
    super(id, data, occurredAt);
  }
}

export class ProspectConverted extends BaseDomainEvent {
  readonly name = 'apporteurs.prospect-converted';
  constructor(
    id: string,
    readonly data: { apporteurId: string; clientId: string; missionId: string; actorId: string },
    occurredAt?: Date,
  ) {
    super(id, data, occurredAt);
  }
}

export class ProspectRejected extends BaseDomainEvent {
  readonly name = 'apporteurs.prospect-rejected';
  constructor(
    id: string,
    readonly data: { apporteurId: string; reason: string | null; actorId: string },
    occurredAt?: Date,
  ) {
    super(id, data, occurredAt);
  }
}

export class CommissionCreated extends BaseDomainEvent {
  readonly name = 'apporteurs.commission-created';
  constructor(
    id: string,
    readonly data: { apporteurId: string; missionId: string; actorId: string },
    occurredAt?: Date,
  ) {
    super(id, data, occurredAt);
  }
}

export class CommissionStatusChanged extends BaseDomainEvent {
  readonly name = 'apporteurs.commission-status-changed';
  constructor(
    id: string,
    readonly data: { apporteurId: string; from: string; to: string; actorId: string },
    occurredAt?: Date,
  ) {
    super(id, data, occurredAt);
  }
}
