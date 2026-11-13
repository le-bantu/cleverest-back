import { Page, PageQuery } from '@shared/kernel';
import { ConsultantInvoice } from '../entities/consultant-invoice.entity';

export const CONSULTANT_INVOICE_REPOSITORY = Symbol('CONSULTANT_INVOICE_REPOSITORY');

export interface ConsultantInvoiceListFilter {
  consultantId?: string;
  missionId?: string;
  isPaid?: boolean;
  uploadedFrom?: Date;
  uploadedTo?: Date;
}

/** PORT. */
export abstract class ConsultantInvoiceRepository {
  abstract nextIdentity(): string;
  abstract findById(id: string): Promise<ConsultantInvoice | null>;
  /** sum already invoiced by the consultant on the main quote (0 when none) */
  abstract totalInvoiced(consultantId: string, quoteId: string): Promise<number>;
  abstract save(invoice: ConsultantInvoice): Promise<void>;
  abstract list(
    query: PageQuery,
    filter: ConsultantInvoiceListFilter,
  ): Promise<Page<ConsultantInvoice>>;
}
