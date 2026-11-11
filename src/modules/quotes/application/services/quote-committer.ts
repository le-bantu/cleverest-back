import { Inject, Injectable } from '@nestjs/common';
import { DomainEvent } from '@shared/kernel';
import { AUDIT_LOG, AuditLogPort } from '@shared/application/ports/audit-log.port';
import { EVENT_BUS, EventBusPort } from '@shared/application/ports/event-bus.port';
import { UNIT_OF_WORK, UnitOfWorkPort } from '@shared/application/ports/unit-of-work.port';
import {
  Quote,
  QUOTE_REPOSITORY,
  QuoteCreated,
  QuoteRepository,
  QuoteStatusChanged,
} from '../../domain';

export const AUDIT_ENTITY = 'Quote';

/**
 * Persists one or more Quote aggregates atomically (UnitOfWork), then writes
 * one AuditLog row per creation / status change and publishes the events.
 */
@Injectable()
export class QuoteCommitter {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWorkPort,
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
  ) {}

  async commit(aggregates: Quote[]): Promise<void> {
    await this.uow.run(async (tx) => {
      for (const quote of aggregates) {
        await this.quotes.save(quote, tx);
      }
    });
    await this.afterCommit(aggregates);
  }

  /** Audit + publish, once the aggregates are durably saved (possibly by another context's UoW). */
  async afterCommit(aggregates: Quote[]): Promise<void> {
    const events = aggregates.flatMap((q) => q.pullDomainEvents());
    await this.auditEvents(events);
    await this.events.publish(events);
  }

  async auditDeletion(quote: Quote, actorId: string): Promise<void> {
    await this.audit.record({
      entity: AUDIT_ENTITY,
      entityId: quote.id,
      action: 'DELETED',
      fromStatus: quote.status,
      toStatus: null,
      actorId,
      metadata: { requestNumber: quote.requestNumber.value },
    });
  }

  private async auditEvents(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      if (event instanceof QuoteStatusChanged) {
        await this.audit.record({
          entity: AUDIT_ENTITY,
          entityId: event.aggregateId,
          action: 'STATUS_CHANGED',
          fromStatus: event.data.from,
          toStatus: event.data.to,
          actorId: event.data.actorId,
          metadata: { actor: event.data.actor },
        });
      } else if (event instanceof QuoteCreated) {
        await this.audit.record({
          entity: AUDIT_ENTITY,
          entityId: event.aggregateId,
          action: 'CREATED',
          fromStatus: null,
          toStatus: event.data.status,
          actorId: event.data.actorId,
          metadata: {
            requestNumber: event.data.requestNumber,
            isSubquote: event.data.isSubquote,
            parentQuoteId: event.data.parentQuoteId,
          },
        });
      }
    }
  }
}
