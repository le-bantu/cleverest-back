import { Logger } from '@nestjs/common';
import { InMemoryEventBus } from './in-memory-event-bus';
import { BaseDomainEvent } from '@shared/kernel';

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

class Ping extends BaseDomainEvent {
  readonly name = 'Ping';
  constructor(id: string) {
    super(id);
  }
}

describe('InMemoryEventBus', () => {
  it('delivers a published event to every subscriber of that name', async () => {
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    bus.subscribe('Ping', (e) => void seen.push(`a:${e.aggregateId}`));
    bus.subscribe('Ping', (e) => void seen.push(`b:${e.aggregateId}`));
    bus.subscribe('Other', () => void seen.push('other'));

    await bus.publish([new Ping('1')]);

    expect(seen).toEqual(['a:1', 'b:1']);
  });

  it('isolates a throwing handler from the others', async () => {
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    bus.subscribe('Ping', () => {
      throw new Error('boom');
    });
    bus.subscribe('Ping', () => void seen.push('ok'));

    await expect(bus.publish([new Ping('1')])).resolves.toBeUndefined();
    expect(seen).toEqual(['ok']);
  });
});
