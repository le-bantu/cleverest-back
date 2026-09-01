import { AbstractValueObject, ValidationException } from '@shared/kernel';

interface OtpCodeProps {
  value: string;
}

const OTP_RE = /^\d{6}$/;

export class OtpCode extends AbstractValueObject<OtpCodeProps> {
  static readonly LENGTH = 6;

  private constructor(value: string) {
    super({ value });
  }

  static create(raw: string): OtpCode {
    const value = String(raw).trim();
    if (!OTP_RE.test(value)) {
      throw new ValidationException('INVALID_OTP_CODE', 'OTP code must be 6 digits');
    }
    return new OtpCode(value);
  }

  /** Deterministic generator injected for tests; defaults to crypto-strong. */
  static generate(rng: () => number = Math.random): OtpCode {
    let value = '';
    for (let i = 0; i < OtpCode.LENGTH; i++) {
      value += Math.floor(rng() * 10).toString();
    }
    return new OtpCode(value);
  }

  get value(): string {
    return this.props.value;
  }

  toString(): string {
    return '******';
  }
}
