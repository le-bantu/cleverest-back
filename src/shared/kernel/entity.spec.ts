import { AbstractEntity } from './entity';

class Thing extends AbstractEntity<string> {
  constructor(
    id: string,
    public label: string,
  ) {
    super(id);
  }
}

describe('AbstractEntity', () => {
  it('exposes its id', () => {
    expect(new Thing('a', 'x').id).toBe('a');
  });

  it('is equal by identity, ignoring other fields', () => {
    expect(new Thing('a', 'x').equals(new Thing('a', 'y'))).toBe(true);
  });

  it('is not equal when ids differ', () => {
    expect(new Thing('a', 'x').equals(new Thing('b', 'x'))).toBe(false);
  });

  it('is not equal to null/undefined/non-entity', () => {
    const t = new Thing('a', 'x');
    expect(t.equals(undefined)).toBe(false);
    expect(t.equals(null as never)).toBe(false);
    expect(t.equals({} as never)).toBe(false);
  });
});
