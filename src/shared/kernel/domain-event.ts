/**
 * A domain event is a plain, immutable fact about something that happened
 * in the domain. Infrastructure decides how (and whether) to dispatch it.
 */
export interface DomainEvent {
  readonly name: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly payload: Record<string, unknown>;
}

export abstract class BaseDomainEvent implements DomainEvent {
  abstract readonly name: string;
  readonly occurredAt: Date;

  protected constructor(
    readonly aggregateId: string,
    readonly payload: Record<string, unknown> = {},
    occurredAt?: Date,
  ) {
    this.occurredAt = occurredAt ?? new Date();
  }
}
