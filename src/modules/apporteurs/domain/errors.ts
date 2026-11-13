import { ConflictException, NotFoundException, ValidationException } from '@shared/kernel';

export const prospectNotFound = (id: string): NotFoundException =>
  new NotFoundException('PROSPECT_NOT_FOUND', 'Prospect not found', { id });

export const commissionNotFound = (id: string): NotFoundException =>
  new NotFoundException('COMMISSION_NOT_FOUND', 'Commission not found', { id });

export const invalidProspect = (code: string, message: string): ValidationException =>
  new ValidationException(code, message);

/** 409 — a prospect is converted OR rejected, once. */
export const prospectAlreadyProcessed = (id: string, status: string): ConflictException =>
  new ConflictException('PROSPECT_ALREADY_PROCESSED', 'The prospect has already been processed', {
    id,
    status,
  });

export const prospectEmailRequired = (id: string): ValidationException =>
  new ValidationException(
    'PROSPECT_EMAIL_REQUIRED',
    'A contact email is required to create the client account',
    { id },
  );

export const commissionTransitionNotAllowed = (from: string, to: string): ConflictException =>
  new ConflictException(
    'COMMISSION_TRANSITION_NOT_ALLOWED',
    `A commission cannot go from ${from} to ${to}`,
    { from, to },
  );

export const commissionAmountRequired = (id: string): ValidationException =>
  new ValidationException(
    'COMMISSION_AMOUNT_REQUIRED',
    'Set the commission amount before validating it',
    { id },
  );

export const commissionLocked = (id: string, status: string): ConflictException =>
  new ConflictException(
    'COMMISSION_LOCKED',
    'The amount can only change while the commission is pending',
    { id, status },
  );
