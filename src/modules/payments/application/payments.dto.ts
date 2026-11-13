import { PageQuery } from '@shared/kernel';
import { ActorContext } from '@shared/application/use-case';
import { IncomingFile } from '@shared/application/files';
import { ClientInvoice, Payment } from '../domain';

export interface PaymentRef {
  actor: ActorContext;
  paymentId: string;
}

export interface SubmitPaymentInput {
  actor: ActorContext;
  missionId: string;
  amount: number;
  file: IncomingFile;
}

export interface ListPaymentsInput extends Partial<PageQuery> {
  actor: ActorContext;
  missionId?: string;
  /** admin only */
  clientId?: string;
  /** admin only: payments of the missions this consultant works on */
  consultantId?: string;
  isValidated?: boolean;
  uploadedFrom?: Date;
  uploadedTo?: Date;
}

/** What a consultant may know about a payment on their mission (no proof, no client). */
export interface ConsultantPaymentView {
  id: string;
  missionId: string;
  amount: number;
  currency: 'EUR';
  isValidated: boolean;
  validatedAt: Date | null;
  createdAt: Date;
}

export interface PaymentView extends ConsultantPaymentView {
  clientId: string;
  proofFileName: string;
  updatedAt: Date;
}

export const toConsultantPaymentView = (p: Payment): ConsultantPaymentView => ({
  id: p.id,
  missionId: p.missionId,
  amount: p.amount,
  currency: 'EUR',
  isValidated: p.isValidated,
  validatedAt: p.validatedAt,
  createdAt: p.createdAt,
});

export const toPaymentView = (p: Payment): PaymentView => ({
  ...toConsultantPaymentView(p),
  clientId: p.clientId,
  proofFileName: p.proofFile.originalName,
  updatedAt: p.updatedAt,
});

export interface ClientInvoiceRef {
  actor: ActorContext;
  invoiceId: string;
}

export interface GenerateClientInvoiceInput {
  actor: ActorContext;
  paymentId: string;
}

export interface ListClientInvoicesInput extends Partial<PageQuery> {
  actor: ActorContext;
  /** admin only */
  clientId?: string;
  missionId?: string;
  sent?: boolean;
}

export interface ClientInvoiceView {
  id: string;
  invoiceNumber: string;
  paymentId: string;
  missionId: string;
  clientId: string;
  amount: number;
  currency: 'EUR';
  generatedAt: Date;
  sentAt: Date | null;
}

export const toClientInvoiceView = (i: ClientInvoice): ClientInvoiceView => ({
  id: i.id,
  invoiceNumber: i.invoiceNumber.value,
  paymentId: i.paymentId,
  missionId: i.missionId,
  clientId: i.clientId,
  amount: i.amount,
  currency: 'EUR',
  generatedAt: i.generatedAt,
  sentAt: i.sentAt,
});
