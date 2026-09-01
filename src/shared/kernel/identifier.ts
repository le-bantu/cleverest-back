import { validate as uuidValidate, version as uuidVersion, v4 as uuidv4 } from 'uuid';
import { AbstractValueObject } from './value-object';
import { ValidationException } from './domain-exception';

export const generateUuid = (): string => uuidv4();

export const isUuid = (value: string): boolean => uuidValidate(value) && uuidVersion(value) === 4;

interface UuidProps {
  value: string;
}

/**
 * UUID v4 value object. Used as the identity type of every aggregate.
 */
export class Uuid extends AbstractValueObject<UuidProps> {
  private constructor(value: string) {
    super({ value });
  }

  static create(value: string): Uuid {
    if (!isUuid(value)) {
      throw new ValidationException('INVALID_UUID', `"${value}" is not a valid UUID v4`);
    }
    return new Uuid(value);
  }

  static generate(): Uuid {
    return new Uuid(generateUuid());
  }

  get value(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
