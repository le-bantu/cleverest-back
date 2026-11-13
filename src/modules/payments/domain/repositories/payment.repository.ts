import { Page, PageQuery } from '@shared/kernel';
import { Payment } from '../entities/payment.entity';
import { ClientInvoice } from '../entities/client-invoice.entity';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
export const CLIENT_INVOICE_REPOSITORY = Symbol('CLIENT_INVOICE_REPOSITORY');

export interface PaymentListFilter {
  clientId?: string;
  missionId?: string;
  /** restrict to these missions (consultant audience / consultant filter) */
  missionIds?: string[];
  isValidated?: boolean;
  /** createdAt >= uploadedFrom */
  uploadedFrom?: Date;
  /** createdAt <= uploadedTo */
  uploadedTo?: Date;
}

/** PORT. */
export abstract class PaymentRepository {
  abstract nextIdentity(): string;
  abstract findById(id: string): Promise<Payment | null>;
  abstract save(payment: Payment): Promise<void>;
  abstract list(query: PageQuery, filter: PaymentListFilter): Promise<Page<Payment>>;
}

export interface ClientInvoiceListFilter {
  clientId?: string;
  missionId?: string;
  sent?: boolean;
}

/** PORT. */
export abstract class ClientInvoiceRepository {
  abstract nextIdentity(): string;
  abstract findById(id: string): Promise<ClientInvoice | null>;
  abstract existsForPayment(paymentId: string): Promise<boolean>;
  /** highest sequence used in `year` (0 when none) */
  abstract lastSequence(year: number): Promise<number>;
  /** maps a duplicate number to `InvoiceNumberTaken`, a duplicate payment to `ClientInvoiceAlreadyExists` */
  abstract save(invoice: ClientInvoice): Promise<void>;
  abstract list(query: PageQuery, filter: ClientInvoiceListFilter): Promise<Page<ClientInvoice>>;
}
