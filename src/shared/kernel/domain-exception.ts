/**
 * Base class for all business rule violations.
 * Carries a stable machine-readable `code` plus an HTTP hint that the
 * interface layer maps to a status. The domain never imports NestJS —
 * `httpStatus` is a plain number.
 */
export type DomainErrorKind =
  | 'VALIDATION' // 422
  | 'NOT_FOUND' // 404
  | 'FORBIDDEN' // 403
  | 'UNAUTHORIZED' // 401
  | 'CONFLICT' // 409
  | 'UNPROCESSABLE'; // 422

const KIND_TO_STATUS: Record<DomainErrorKind, number> = {
  VALIDATION: 422,
  UNPROCESSABLE: 422,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
  CONFLICT: 409,
};

export class DomainException extends Error {
  readonly code: string;
  readonly kind: DomainErrorKind;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    kind: DomainErrorKind = 'UNPROCESSABLE',
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = code;
    this.code = code;
    this.kind = kind;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get httpStatus(): number {
    return KIND_TO_STATUS[this.kind];
  }
}

export class ValidationException extends DomainException {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 'VALIDATION', details);
  }
}

export class NotFoundException extends DomainException {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 'NOT_FOUND', details);
  }
}

export class ForbiddenException extends DomainException {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 'FORBIDDEN', details);
  }
}

export class UnauthorizedException extends DomainException {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 'UNAUTHORIZED', details);
  }
}

export class ConflictException extends DomainException {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 'CONFLICT', details);
  }
}
