import { ConflictException, NotFoundException, ValidationException } from '@shared/kernel';

export const contractNotFound = (id: string): NotFoundException =>
  new NotFoundException('CONTRACT_NOT_FOUND', 'Contract not found', { id });

/** 409 — one contract per quote. */
export class ContractAlreadyExists extends ConflictException {
  constructor(quoteId: string) {
    super('CONTRACT_ALREADY_EXISTS', 'A contract already exists for this quote', { quoteId });
  }
}

/** 422 — a contract is drawn up from a VALIDÉ_ADMIN main quote only. */
export class QuoteNotReadyForContract extends ValidationException {
  constructor(quoteId: string, status: string) {
    super('QUOTE_NOT_VALIDATED', 'The quote must be validated by an admin (VALIDÉ_ADMIN)', {
      quoteId,
      status,
    });
  }
}

export const contractAlreadySigned = (id: string): ConflictException =>
  new ConflictException('CONTRACT_ALREADY_SIGNED', 'The contract is already signed', { id });

// ------------------------------------------------------------ consultant contracts

export const consultantContractNotFound = (id: string): NotFoundException =>
  new NotFoundException('CONSULTANT_CONTRACT_NOT_FOUND', 'Consultant contract not found', { id });

/** 409 — one consultant contract per (quote, consultant). */
export class ConsultantContractAlreadyExists extends ConflictException {
  constructor(quoteId: string, consultantId: string) {
    super(
      'CONSULTANT_CONTRACT_ALREADY_EXISTS',
      'A contract already exists for this consultant on this quote',
      { quoteId, consultantId },
    );
  }
}

/** 422 — the consultant's price must have been validated by an admin. */
export const quoteNotEngageable = (quoteId: string, status: string): ValidationException =>
  new ValidationException(
    'QUOTE_NOT_VALIDATED',
    'The quote must be validated by an admin (VALIDÉ_ADMIN or SIGNÉ_CLIENT)',
    { quoteId, status },
  );

export const consultantNotOnQuote = (quoteId: string, consultantId: string): ValidationException =>
  new ValidationException(
    'CONSULTANT_NOT_ON_QUOTE',
    'The consultant is not assigned to this quote',
    {
      quoteId,
      consultantId,
    },
  );

export const invalidConsultantContractAmount = (
  code: string,
  message: string,
): ValidationException => new ValidationException(code, message);

export const consultantContractAlreadySigned = (id: string): ConflictException =>
  new ConflictException(
    'CONSULTANT_CONTRACT_ALREADY_SIGNED',
    'The consultant contract is already signed',
    { id },
  );
