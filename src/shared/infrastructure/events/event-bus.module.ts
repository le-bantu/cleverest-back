import { Global, Module } from '@nestjs/common';
import { EVENT_BUS, EventBusPort } from '@shared/application/ports/event-bus.port';
import { InMemoryEventBus } from './in-memory-event-bus';

@Global()
@Module({
  providers: [
    InMemoryEventBus,
    { provide: EVENT_BUS, useExisting: InMemoryEventBus },
    { provide: EventBusPort, useExisting: InMemoryEventBus },
  ],
  exports: [EVENT_BUS, EventBusPort],
})
export class EventBusModule {}
