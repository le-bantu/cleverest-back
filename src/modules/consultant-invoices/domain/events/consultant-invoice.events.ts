import { BaseDomainEvent } from '@shared/kernel';

export class ConsultantInvoiceSubmitted extends BaseDomainEvent {
  readonly name = 'consultant-invoices.submitted';
  constructor(
    invoiceId: string,
    readonly data: { missionId: string; consultantId: string; amount: number },
    occurredAt?: Date,
  ) {
    super(invoiceId, data, occurredAt);
  }
}

export class ConsultantInvoicePaid extends BaseDomainEvent {
  readonly name = 'consultant-invoices.paid';
  constructor(
    invoiceId: string,
    readonly data: { missionId: string; consultantId: string; amount: number; actorId: string },
    occurredAt?: Date,
  ) {
    super(invoiceId, data, occurredAt);
  }
}
