import { OtpCode } from './otp-code.vo';
import { ValidationException } from '@shared/kernel';

describe('OtpCode', () => {
  it('accepts a 6-digit string', () => {
    expect(OtpCode.create('012345').value).toBe('012345');
  });

  it('rejects non 6-digit values', () => {
    for (const bad of ['1234', '1234567', 'abcdef', '12 45 6']) {
      expect(() => OtpCode.create(bad)).toThrow(ValidationException);
    }
  });

  it('generate() is deterministic for a given rng and yields 6 digits', () => {
    const seq = [0.05, 0.17, 0.29, 0.42, 0.58, 0.93];
    const expected = seq.map((v) => Math.floor(v * 10).toString()).join('');
    let i = 0;
    const code = OtpCode.generate(() => seq[i++]);
    expect(code.value).toBe(expected);
    expect(code.value).toMatch(/^\d{6}$/);
  });

  it('hides its value on toString', () => {
    expect(String(OtpCode.create('123456'))).toBe('******');
  });
});
