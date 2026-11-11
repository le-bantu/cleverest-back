import { BaseDomainEvent } from '@shared/kernel';
import { QuoteActor, QuoteStatus } from '../value-objects/quote-status.vo';

export class QuoteCreated extends BaseDomainEvent {
  readonly name = 'quotes.quote-created';

  constructor(
    quoteId: string,
    readonly data: {
      clientId: string;
      requestNumber: string;
      isSubquote: boolean;
      parentQuoteId: string | null;
      status: QuoteStatus;
      actorId: string | null;
    },
    occurredAt?: Date,
  ) {
    super(quoteId, data, occurredAt);
  }
}

export class QuoteStatusChanged extends BaseDomainEvent {
  readonly name = 'quotes.quote-status-changed';

  constructor(
    quoteId: string,
    readonly data: {
      from: QuoteStatus;
      to: QuoteStatus;
      actor: QuoteActor;
      actorId: string;
      clientId: string;
    },
    occurredAt?: Date,
  ) {
    super(quoteId, data, occurredAt);
  }
}

export class QuoteSplit extends BaseDomainEvent {
  readonly name = 'quotes.quote-split';

  constructor(
    quoteId: string,
    readonly data: { subquoteIds: string[]; actorId: string },
    occurredAt?: Date,
  ) {
    super(quoteId, data, occurredAt);
  }
}

export class ConsultantsAssignedToQuote extends BaseDomainEvent {
  readonly name = 'quotes.consultants-assigned';

  constructor(
    quoteId: string,
    readonly data: {
      consultantIds: string[];
      newlyAssignedIds: string[];
      leadId: string | null;
      actorId: string;
    },
    occurredAt?: Date,
  ) {
    super(quoteId, data, occurredAt);
  }
}
