import { BaseDomainEvent } from '@shared/kernel';

type DeliverableData = {
  missionId: string;
  clientId: string;
  consultantId: string;
  actorId: string;
};

export class DeliverableUploaded extends BaseDomainEvent {
  readonly name = 'deliverables.uploaded';
  constructor(
    id: string,
    readonly data: DeliverableData,
    occurredAt?: Date,
  ) {
    super(id, data, occurredAt);
  }
}

/** Released to the client. */
export class DeliverableValidatedByAdmin extends BaseDomainEvent {
  readonly name = 'deliverables.validated-by-admin';
  constructor(
    id: string,
    readonly data: DeliverableData,
    occurredAt?: Date,
  ) {
    super(id, data, occurredAt);
  }
}

export class DeliverableValidatedByClient extends BaseDomainEvent {
  readonly name = 'deliverables.validated-by-client';
  constructor(
    id: string,
    readonly data: DeliverableData,
    occurredAt?: Date,
  ) {
    super(id, data, occurredAt);
  }
}
