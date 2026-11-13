import { BaseDomainEvent } from '@shared/kernel';

export class PaymentSubmitted extends BaseDomainEvent {
  readonly name = 'payments.payment-submitted';
  constructor(
    paymentId: string,
    readonly data: { missionId: string; clientId: string; amount: number },
    occurredAt?: Date,
  ) {
    super(paymentId, data, occurredAt);
  }
}

export class PaymentValidated extends BaseDomainEvent {
  readonly name = 'payments.payment-validated';
  constructor(
    paymentId: string,
    readonly data: { missionId: string; clientId: string; amount: number; actorId: string },
    occurredAt?: Date,
  ) {
    super(paymentId, data, occurredAt);
  }
}

export class ClientInvoiceGenerated extends BaseDomainEvent {
  readonly name = 'payments.client-invoice-generated';
  constructor(
    invoiceId: string,
    readonly data: { paymentId: string; invoiceNumber: string; amount: number; actorId: string },
    occurredAt?: Date,
  ) {
    super(invoiceId, data, occurredAt);
  }
}

export class ClientInvoiceSent extends BaseDomainEvent {
  readonly name = 'payments.client-invoice-sent';
  constructor(
    invoiceId: string,
    readonly data: { invoiceNumber: string; clientId: string; actorId: string },
    occurredAt?: Date,
  ) {
    super(invoiceId, data, occurredAt);
  }
}
