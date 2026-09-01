import { AbstractValueObject, ValidationException } from '@shared/kernel';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EmailProps {
  value: string;
}

export class Email extends AbstractValueObject<EmailProps> {
  private constructor(value: string) {
    super({ value });
  }

  static create(raw: string): Email {
    const value = raw.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      throw new ValidationException('INVALID_EMAIL', `"${raw}" is not a valid email address`);
    }
    return new Email(value);
  }

  get value(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
