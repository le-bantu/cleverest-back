import { Password } from './password.vo';
import { ValidationException } from '@shared/kernel';

describe('Password', () => {
  it('accepts a compliant password and exposes the raw value', () => {
    expect(Password.create('secret12').value).toBe('secret12');
  });

  it('rejects passwords shorter than 8 chars', () => {
    expect(() => Password.create('ab1')).toThrow(ValidationException);
  });

  it('rejects passwords without a digit or without a letter', () => {
    expect(() => Password.create('abcdefgh')).toThrow(ValidationException);
    expect(() => Password.create('12345678')).toThrow(ValidationException);
  });

  it('rejects passwords longer than 128 chars', () => {
    expect(() => Password.create('a1'.repeat(65))).toThrow(ValidationException);
  });

  it('never reveals the value via toString', () => {
    expect(String(Password.create('secret12'))).toBe('[REDACTED]');
  });
});
