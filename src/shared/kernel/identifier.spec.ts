import { Uuid, generateUuid, isUuid } from './identifier';
import { ValidationException } from './domain-exception';

describe('Uuid', () => {
  it('generateUuid produces a valid v4 uuid', () => {
    const value = generateUuid();
    expect(isUuid(value)).toBe(true);
  });

  it('Uuid.generate wraps a fresh uuid', () => {
    const id = Uuid.generate();
    expect(isUuid(id.value)).toBe(true);
  });

  it('Uuid.create accepts a valid uuid and round-trips', () => {
    const value = generateUuid();
    expect(Uuid.create(value).toString()).toBe(value);
  });

  it('Uuid.create rejects a non-uuid', () => {
    expect(() => Uuid.create('not-a-uuid')).toThrow(ValidationException);
  });

  it('two Uuid with same value are equal', () => {
    const value = generateUuid();
    expect(Uuid.create(value).equals(Uuid.create(value))).toBe(true);
  });
});
