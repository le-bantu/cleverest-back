import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent } from '@shared/kernel';
import { EventBusPort, EventHandler } from '@shared/application/ports/event-bus.port';

@Injectable()
export class InMemoryEventBus extends EventBusPort {
  private readonly logger = new Logger(InMemoryEventBus.name);
  private readonly handlers = new Map<string, EventHandler[]>();

  subscribe(eventName: string, handler: EventHandler): void {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler);
    this.handlers.set(eventName, list);
  }

  async publish(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      const list = this.handlers.get(event.name) ?? [];
      for (const handler of list) {
        try {
          await handler(event);
        } catch (err) {
          this.logger.error(`Handler for ${event.name} failed`, err as Error);
        }
      }
    }
  }
}
