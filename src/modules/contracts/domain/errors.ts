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
