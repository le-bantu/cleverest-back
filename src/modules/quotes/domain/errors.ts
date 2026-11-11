import {
  ConflictException,
  DomainException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from '@shared/kernel';
import { QuoteActor, QuoteStatus } from './value-objects/quote-status.vo';

/** 409 — the requested status change is not in the state machine for this actor. */
export class QuoteTransitionNotAllowed extends ConflictException {
  constructor(from: QuoteStatus, to: QuoteStatus, actor: QuoteActor) {
    super(
      'QUOTE_TRANSITION_NOT_ALLOWED',
      `Transition ${from} → ${to} is not allowed for ${actor}`,
      { from, to, actor },
    );
  }
}

/** 422 — the consultant SLA has passed; the quote must be re-opened by an admin. */
export class DeadlineExceeded extends DomainException {
  constructor(deadline: Date) {
    super(
      'DEADLINE_EXCEEDED',
      'The consultant deadline for this quote has passed',
      'UNPROCESSABLE',
      {
        deadline: deadline.toISOString(),
      },
    );
  }
}

export const quoteNotFound = (id: string): NotFoundException =>
  new NotFoundException('QUOTE_NOT_FOUND', 'Quote not found', { id });

export const documentNotFound = (id: string): NotFoundException =>
  new NotFoundException('QUOTE_DOCUMENT_NOT_FOUND', 'Quote document not found', { id });

export const quoteAccessDenied = (): ForbiddenException =>
  new ForbiddenException('QUOTE_ACCESS_DENIED', 'You do not have access to this quote');

export const invalidQuote = (code: string, message: string): ValidationException =>
  new ValidationException(code, message);

export const quoteConflict = (code: string, message: string): ConflictException =>
  new ConflictException(code, message);
