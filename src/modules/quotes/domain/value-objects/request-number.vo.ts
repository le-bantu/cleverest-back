import { AbstractValueObject, ValidationException } from '@shared/kernel';

const PATTERN = /^req-(\d{3,})$/;

/** Human-facing quote reference: `req-001`, `req-002`, … `req-1000`. */
export class RequestNumber extends AbstractValueObject<{ value: string }> {
  private constructor(value: string) {
    super({ value });
  }

  static create(value: string): RequestNumber {
    if (!PATTERN.test(value)) {
      throw new ValidationException(
        'INVALID_REQUEST_NUMBER',
        `"${value}" is not a valid request number`,
      );
    }
    return new RequestNumber(value);
  }

  static fromSequence(sequence: number): RequestNumber {
    if (!Number.isInteger(sequence) || sequence < 1) {
      throw new ValidationException(
        'INVALID_REQUEST_NUMBER',
        'Sequence must be a positive integer',
      );
    }
    return new RequestNumber(`req-${String(sequence).padStart(3, '0')}`);
  }

  get value(): string {
    return this.props.value;
  }

  get sequence(): number {
    return Number(PATTERN.exec(this.props.value)![1]);
  }

  toString(): string {
    return this.props.value;
  }
}
