import { ActorContext } from '@shared/application/use-case';
import { PageQuery } from '@shared/kernel';

export type { ActorContext };

export interface QuoteRef {
  actor: ActorContext;
  quoteId: string;
}

export interface CreateQuoteInput {
  actor: ActorContext;
  type: string;
  title?: string | null;
  description: string;
}

export interface CommonListFilters {
  status?: string;
  type?: string;
  dateMin?: Date;
  dateMax?: Date;
}

export interface ListMyQuotesInput extends Partial<PageQuery>, CommonListFilters {
  actor: ActorContext;
}

export interface ListConsultantQuotesInput extends Partial<PageQuery> {
  actor: ActorContext;
  status?: string;
  isSubquote?: boolean;
  isValidated?: boolean;
}

export interface ListAdminQuotesInput extends Partial<PageQuery>, CommonListFilters {
  actor: ActorContext;
  clientId?: string;
  isValidated?: boolean;
  isSubquote?: boolean;
  parentQuoteId?: string;
}

export interface ReviewClientQuoteInput extends QuoteRef {
  status: string;
  adminNotes?: string | null;
  adminNotesToConsultant?: string | null;
  adminNotesToClient?: string | null;
  rejectedReason?: string | null;
  description?: string;
  price?: number | null;
}

export interface SubmitConsultantQuoteInput extends QuoteRef {
  price: number;
  consultantNotes?: string | null;
}

export interface ValidateConsultantQuoteInput extends QuoteRef {
  status: string;
  adminNotes?: string | null;
  adminNotesToConsultant?: string | null;
  rejectedReason?: string | null;
}

export interface SignOrRejectQuoteInput extends QuoteRef {
  action: 'sign' | 'reject';
  rejectedReason?: string | null;
}

export interface SplitQuoteInput extends QuoteRef {
  consultants: string[];
}

export interface CreateSubquoteInput extends QuoteRef {
  title: string;
  description: string;
  consultantId: string;
  consultantDeadline?: Date | null;
}

export interface AssignConsultantsInput extends QuoteRef {
  consultants: Array<{ id: string; isLead?: boolean }>;
  consultantDeadline?: Date | null;
}

export interface SetAdminNotesToConsultantInput extends QuoteRef {
  adminNotesToConsultant: string;
}

export interface UploadedFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string | null;
  size: number;
}

export interface UploadQuoteDocumentInput extends QuoteRef {
  file: UploadedFile;
  label?: string | null;
  comment?: string | null;
  visibility?: string | null;
  visibleUsers?: string[];
}

export interface QuoteDocumentRef extends QuoteRef {
  documentId: string;
}

export interface SetDocumentVisibilityInput {
  actor: ActorContext;
  documentId: string;
  visibleTo: string;
  visibleUsers?: string[];
}

export interface DownloadedDocument {
  content: Buffer;
  fileName: string;
  mimeType: string;
}
