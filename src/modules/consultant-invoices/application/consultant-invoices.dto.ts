import { PageQuery } from '@shared/kernel';
import { ActorContext } from '@shared/application/use-case';
import { IncomingFile } from '@shared/application/files';
import { ConsultantInvoice } from '../domain';

export interface ConsultantInvoiceRef {
  actor: ActorContext;
  invoiceId: string;
}

export interface SubmitConsultantInvoiceInput {
  actor: ActorContext;
  missionId: string;
  /** defaults to what remains to invoice on the consultant contract */
  amount?: number | null;
  file: IncomingFile;
}

export interface ListConsultantInvoicesInput extends Partial<PageQuery> {
  actor: ActorContext;
  /** admin only */
  consultantId?: string;
  missionId?: string;
  isPaid?: boolean;
  uploadedFrom?: Date;
  uploadedTo?: Date;
}

export interface ConsultantInvoiceView {
  id: string;
  consultantId: string;
  missionId: string;
  quoteId: string;
  amount: number;
  currency: 'EUR';
  fileName: string;
  uploadedAt: Date;
  isPaid: boolean;
  paidAt: Date | null;
}

export const toConsultantInvoiceView = (i: ConsultantInvoice): ConsultantInvoiceView => ({
  id: i.id,
  consultantId: i.consultantId,
  missionId: i.missionId,
  quoteId: i.quoteId,
  amount: i.amount,
  currency: 'EUR',
  fileName: i.file.originalName,
  uploadedAt: i.uploadedAt,
  isPaid: i.isPaid,
  paidAt: i.paidAt,
});
