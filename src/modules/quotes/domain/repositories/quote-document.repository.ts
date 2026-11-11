import { QuoteDocument } from '../entities/quote-document.entity';

export const QUOTE_DOCUMENT_REPOSITORY = Symbol('QUOTE_DOCUMENT_REPOSITORY');

/** PORT. Persists quote documents and their visibility rule (incl. SPECIFIC users). */
export abstract class QuoteDocumentRepository {
  abstract nextIdentity(): string;
  abstract findById(id: string): Promise<QuoteDocument | null>;
  abstract listByQuote(quoteId: string): Promise<QuoteDocument[]>;
  abstract save(document: QuoteDocument): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
