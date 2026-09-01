import { Email } from './email.vo';
import { ValidationException } from '@shared/kernel';

describe('Email', () => {
  it('normalizes to trimmed lowercase', () => {
    expect(Email.create('  John.Doe@Example.COM ').value).toBe('john.doe@example.com');
  });

  it('rejects malformed addresses', () => {
    for (const bad of ['x', 'x@', '@y.com', 'a b@c.com', 'no-at.com']) {
      expect(() => Email.create(bad)).toThrow(ValidationException);
    }
  });

  it('is comparable by value', () => {
    expect(Email.create('a@b.com').equals(Email.create('A@B.COM'))).toBe(true);
  });
});
