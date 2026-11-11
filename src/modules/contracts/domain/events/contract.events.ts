import { BaseDomainEvent } from '@shared/kernel';

export class ContractCreated extends BaseDomainEvent {
  readonly name = 'contracts.contract-created';
  constructor(
    contractId: string,
    readonly data: { quoteId: string; clientId: string; actorId: string },
    occurredAt?: Date,
  ) {
    super(contractId, data, occurredAt);
  }
}

export class ContractSigned extends BaseDomainEvent {
  readonly name = 'contracts.contract-signed';
  constructor(
    contractId: string,
    readonly data: { quoteId: string; clientId: string; actorId: string },
    occurredAt?: Date,
  ) {
    super(contractId, data, occurredAt);
  }
}

export class ConsultantContractCreated extends BaseDomainEvent {
  readonly name = 'contracts.consultant-contract-created';
  constructor(
    contractId: string,
    readonly data: { quoteId: string; consultantId: string; amount: number; actorId: string },
    occurredAt?: Date,
  ) {
    super(contractId, data, occurredAt);
  }
}

export class ConsultantContractSigned extends BaseDomainEvent {
  readonly name = 'contracts.consultant-contract-signed';
  constructor(
    contractId: string,
    readonly data: { quoteId: string; consultantId: string; actorId: string },
    occurredAt?: Date,
  ) {
    super(contractId, data, occurredAt);
  }
}
