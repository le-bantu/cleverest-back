import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from '@shared/kernel';

export const consultantInvoiceNotFound = (id: string): NotFoundException =>
  new NotFoundException('CONSULTANT_INVOICE_NOT_FOUND', 'Consultant invoice not found', { id });

export const invoiceMissionNotFound = (id: string): NotFoundException =>
  new NotFoundException('MISSION_NOT_FOUND', 'Mission not found', { id });

export const invoiceContractNotSigned = (): ForbiddenException =>
  new ForbiddenException(
    'CONSULTANT_CONTRACT_NOT_SIGNED',
    'Sign your contract with The Cleverest before invoicing this mission',
  );

export const contractFullyInvoiced = (quoteId: string): ConflictException =>
  new ConflictException(
    'CONTRACT_FULLY_INVOICED',
    'The amount of your consultant contract is already fully invoiced',
    { quoteId },
  );

export const invoiceExceedsContract = (remaining: number): ValidationException =>
  new ValidationException(
    'INVOICE_EXCEEDS_CONTRACT',
    'The amount exceeds what remains to invoice on your consultant contract',
    { remaining },
  );

export const consultantInvoiceAlreadyPaid = (id: string): ConflictException =>
  new ConflictException('CONSULTANT_INVOICE_ALREADY_PAID', 'The invoice is already paid', { id });
