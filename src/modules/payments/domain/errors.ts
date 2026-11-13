import { ConflictException, NotFoundException, ValidationException } from '@shared/kernel';

export const paymentNotFound = (id: string): NotFoundException =>
  new NotFoundException('PAYMENT_NOT_FOUND', 'Payment not found', { id });

export const clientInvoiceNotFound = (id: string): NotFoundException =>
  new NotFoundException('CLIENT_INVOICE_NOT_FOUND', 'Client invoice not found', { id });

export const missionNotFound = (id: string): NotFoundException =>
  new NotFoundException('MISSION_NOT_FOUND', 'Mission not found', { id });

export const paymentAlreadyValidated = (id: string): ConflictException =>
  new ConflictException('PAYMENT_ALREADY_VALIDATED', 'The payment is already validated', { id });

/** 422 — an invoice is only issued for a payment an admin validated. */
export const paymentNotValidated = (id: string): ValidationException =>
  new ValidationException(
    'PAYMENT_NOT_VALIDATED',
    'The payment must be validated before an invoice is generated',
    { paymentId: id },
  );

/** 409 — one invoice per payment. */
export class ClientInvoiceAlreadyExists extends ConflictException {
  constructor(paymentId: string) {
    super('CLIENT_INVOICE_ALREADY_EXISTS', 'An invoice already exists for this payment', {
      paymentId,
    });
  }
}

/** 409 — another invoice took the number concurrently (the use case retries). */
export class InvoiceNumberTaken extends ConflictException {
  constructor(invoiceNumber: string) {
    super('INVOICE_NUMBER_TAKEN', 'This invoice number is already used', { invoiceNumber });
  }
}

export const invalidInvoiceNumber = (value: string): ValidationException =>
  new ValidationException('INVALID_INVOICE_NUMBER', 'Malformed invoice number', { value });
