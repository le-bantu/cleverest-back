import { AbstractEntity } from './entity';
import { DomainEvent } from './domain-event';

/**
 * Aggregate root: entity that additionally records domain events.
 * The application layer calls `pullDomainEvents()` after persistence
 * to hand them to the event bus.
 */
export abstract class AbstractAggregateRoot<Id> extends AbstractEntity<Id> {
  private _domainEvents: DomainEvent[] = [];

  get domainEvents(): readonly DomainEvent[] {
    return this._domainEvents;
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  pullDomainEvents(): DomainEvent[] {
    const events = this._domainEvents;
    this._domainEvents = [];
    return events;
  }

  clearDomainEvents(): void {
    this._domainEvents = [];
  }
}
