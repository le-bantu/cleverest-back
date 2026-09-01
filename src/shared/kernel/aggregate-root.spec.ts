import { AbstractAggregateRoot } from './aggregate-root';
import { BaseDomainEvent } from './domain-event';

class Opened extends BaseDomainEvent {
  readonly name = 'Opened';
  constructor(aggregateId: string, payload: Record<string, unknown> = {}) {
    super(aggregateId, payload);
  }
}

class Box extends AbstractAggregateRoot<string> {
  constructor(id: string) {
    super(id);
  }

  open() {
    this.addDomainEvent(new Opened(this.id, { at: 'now' }));
  }
}

describe('AbstractAggregateRoot', () => {
  it('records domain events', () => {
    const box = new Box('1');
    box.open();
    expect(box.domainEvents).toHaveLength(1);
    expect(box.domainEvents[0].name).toBe('Opened');
    expect(box.domainEvents[0].aggregateId).toBe('1');
  });

  it('pullDomainEvents returns and clears', () => {
    const box = new Box('1');
    box.open();
    const pulled = box.pullDomainEvents();
    expect(pulled).toHaveLength(1);
    expect(box.domainEvents).toHaveLength(0);
  });

  it('clearDomainEvents empties the buffer', () => {
    const box = new Box('1');
    box.open();
    box.clearDomainEvents();
    expect(box.domainEvents).toHaveLength(0);
  });
});
