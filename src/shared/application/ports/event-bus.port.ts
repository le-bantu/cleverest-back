import { DomainEvent } from '@shared/kernel';

export const EVENT_BUS = Symbol('EVENT_BUS');

export type EventHandler = (event: DomainEvent) => void | Promise<void>;

/** Publishes domain events pulled from aggregates after persistence. */
export abstract class EventBusPort {
  abstract publish(events: DomainEvent[]): Promise<void>;
  abstract subscribe(eventName: string, handler: EventHandler): void;
}
