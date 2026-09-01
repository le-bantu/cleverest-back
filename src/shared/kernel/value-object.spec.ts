import { AbstractValueObject } from './value-object';

class Money extends AbstractValueObject<{ amount: number; currency: string }> {
  constructor(amount: number, currency: string) {
    super({ amount, currency });
  }
}

describe('AbstractValueObject', () => {
  it('is structurally equal when props match', () => {
    expect(new Money(10, 'EUR').equals(new Money(10, 'EUR'))).toBe(true);
  });

  it('is not equal when props differ', () => {
    expect(new Money(10, 'EUR').equals(new Money(11, 'EUR'))).toBe(false);
  });

  it('is not equal to null/undefined/non-VO', () => {
    const m = new Money(1, 'EUR');
    expect(m.equals(undefined)).toBe(false);
    expect(m.equals(null as never)).toBe(false);
    expect(m.equals({} as never)).toBe(false);
  });

  it('freezes its props', () => {
    const m = new Money(1, 'EUR');
    expect(Object.isFrozen((m as unknown as { props: object }).props)).toBe(true);
  });
});
