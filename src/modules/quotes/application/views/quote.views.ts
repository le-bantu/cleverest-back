import { ConsultantAssignment, Quote, QuoteDocument, ShortlistEntry } from '../../domain';

interface QuoteBaseView {
  id: string;
  requestNumber: string;
  type: string;
  title: string | null;
  description: string;
  status: string;
  isSubquote: boolean;
  parentQuoteId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Client-facing view: no internal admin/consultant notes; price only once validated. */
export interface ClientQuoteView extends QuoteBaseView {
  price: number | null;
  currency: string | null;
  adminNotesToClient: string | null;
  rejectedReason: string | null;
  validatedAt: string | null;
}

export interface ConsultantQuoteView extends QuoteBaseView {
  price: number | null;
  currency: string | null;
  consultantNotes: string | null;
  adminNotesToConsultant: string | null;
  submittedAt: string | null;
  validatedAt: string | null;
  consultantDeadline: string | null;
  consultantDeadlineExceeded: boolean;
  isLead: boolean;
  consultants: ConsultantAssignment[];
}

export interface AdminQuoteView extends QuoteBaseView {
  clientId: string;
  price: number | null;
  currency: string | null;
  adminNotes: string | null;
  adminNotesToConsultant: string | null;
  adminNotesToClient: string | null;
  consultantNotes: string | null;
  rejectedReason: string | null;
  quotedById: string | null;
  consultants: ConsultantAssignment[];
  leadConsultantId: string | null;
  submittedAt: string | null;
  validatedAt: string | null;
  adminDeadline: string | null;
  consultantDeadline: string | null;
  adminDeadlineExceeded: boolean;
  consultantDeadlineExceeded: boolean;
}

export interface AdminQuoteDetailView extends AdminQuoteView {
  subquotes: AdminQuoteView[];
}

export interface SubquoteWithDocumentsView extends AdminQuoteView {
  documents: QuoteDocumentView[];
}

export interface QuoteDocumentView {
  id: string;
  quoteId: string;
  uploadedById: string;
  uploadedByRole: string;
  label: string | null;
  originalName: string;
  mimeType: string | null;
  size: number;
  comment: string | null;
  visibleTo: string;
  visibleUsers: string[];
  createdAt: string;
}

export type ShortlistView = ShortlistEntry[];

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

const base = (q: Quote): QuoteBaseView => ({
  id: q.id,
  requestNumber: q.requestNumber.value,
  type: q.type,
  title: q.title,
  description: q.description,
  status: q.status,
  isSubquote: q.isSubquote,
  parentQuoteId: q.parentQuoteId,
  createdAt: q.createdAt.toISOString(),
  updatedAt: q.updatedAt.toISOString(),
});

export const toClientQuoteView = (q: Quote): ClientQuoteView => {
  const showPrice = q.isPriceVisibleToClient && q.price !== null;
  return {
    ...base(q),
    price: showPrice ? q.price!.amount : null,
    currency: showPrice ? q.price!.currency : null,
    adminNotesToClient: q.adminNotesToClient,
    rejectedReason: q.rejectedReason,
    validatedAt: iso(q.validatedAt),
  };
};

export const toConsultantQuoteView = (
  q: Quote,
  consultantId: string,
  now: Date,
): ConsultantQuoteView => ({
  ...base(q),
  price: q.price?.amount ?? null,
  currency: q.price?.currency ?? null,
  consultantNotes: q.consultantNotes,
  adminNotesToConsultant: q.adminNotesToConsultant,
  submittedAt: iso(q.submittedAt),
  validatedAt: iso(q.validatedAt),
  consultantDeadline: iso(q.consultantDeadline),
  consultantDeadlineExceeded: q.isConsultantDeadlineExceeded(now),
  isLead: q.leadConsultantId === consultantId,
  consultants: q.consultants,
});

export const toAdminQuoteView = (q: Quote, now: Date): AdminQuoteView => ({
  ...base(q),
  clientId: q.clientId,
  price: q.price?.amount ?? null,
  currency: q.price?.currency ?? null,
  adminNotes: q.adminNotes,
  adminNotesToConsultant: q.adminNotesToConsultant,
  adminNotesToClient: q.adminNotesToClient,
  consultantNotes: q.consultantNotes,
  rejectedReason: q.rejectedReason,
  quotedById: q.quotedById,
  consultants: q.consultants,
  leadConsultantId: q.leadConsultantId,
  submittedAt: iso(q.submittedAt),
  validatedAt: iso(q.validatedAt),
  adminDeadline: iso(q.adminDeadline),
  consultantDeadline: iso(q.consultantDeadline),
  adminDeadlineExceeded: q.isAdminDeadlineExceeded(now),
  consultantDeadlineExceeded: q.isConsultantDeadlineExceeded(now),
});

export const toQuoteDocumentView = (d: QuoteDocument): QuoteDocumentView => ({
  id: d.id,
  quoteId: d.quoteId,
  uploadedById: d.uploadedById,
  uploadedByRole: d.uploadedByRole,
  label: d.label,
  originalName: d.originalName,
  mimeType: d.mimeType,
  size: d.size,
  comment: d.comment,
  visibleTo: d.visibility.visibleTo,
  visibleUsers: d.visibility.userIds,
  createdAt: d.createdAt.toISOString(),
});
