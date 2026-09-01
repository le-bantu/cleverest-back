import { AbstractValueObject, ValidationException } from '@shared/kernel';

interface PasswordProps {
  value: string;
}

/**
 * A plaintext password that satisfies the account policy. It is created only
 * transiently (registration / password change) then handed to a PasswordHasher.
 * It is never persisted and never logged.
 */
export class Password extends AbstractValueObject<PasswordProps> {
  static readonly MIN_LENGTH = 8;
  static readonly MAX_LENGTH = 128;

  private constructor(value: string) {
    super({ value });
  }

  static create(raw: string): Password {
    if (typeof raw !== 'string' || raw.length < Password.MIN_LENGTH) {
      throw new ValidationException(
        'WEAK_PASSWORD',
        `Password must be at least ${Password.MIN_LENGTH} characters`,
      );
    }
    if (raw.length > Password.MAX_LENGTH) {
      throw new ValidationException(
        'WEAK_PASSWORD',
        `Password must be at most ${Password.MAX_LENGTH} characters`,
      );
    }
    if (!/[A-Za-z]/.test(raw) || !/[0-9]/.test(raw)) {
      throw new ValidationException(
        'WEAK_PASSWORD',
        'Password must contain at least one letter and one digit',
      );
    }
    return new Password(raw);
  }

  get value(): string {
    return this.props.value;
  }

  toString(): string {
    return '[REDACTED]';
  }
}
