import { Page, PageQuery } from '@shared/kernel';
import { Quote } from '../entities/quote.entity';
import { QuoteStatus } from '../value-objects/quote-status.vo';
import { QuoteType } from '../value-objects/quote-type.vo';

export const QUOTE_REPOSITORY = Symbol('QUOTE_REPOSITORY');

export interface QuoteListFilter {
  clientId?: string;
  /** quotes the consultant is assigned to */
  consultantId?: string;
  status?: QuoteStatus;
  type?: QuoteType;
  /** createdAt >= dateMin */
  dateMin?: Date;
  /** createdAt <= dateMax */
  dateMax?: Date;
  /** validatedAt is (not) null */
  isValidated?: boolean;
  isSubquote?: boolean;
  parentQuoteId?: string;
  /** a contract exists (or not) for the quote */
  hasContract?: boolean;
}

/**
 * PORT. Persists the Quote aggregate with its consultant assignments.
 * `tx` is the opaque transactional context handed out by `UnitOfWorkPort`.
 */
export abstract class QuoteRepository {
  abstract nextIdentity(): string;
  abstract findById(id: string, tx?: unknown): Promise<Quote | null>;
  abstract findSubquotes(parentQuoteId: string): Promise<Quote[]>;
  abstract hasSubquotes(parentQuoteId: string, tx?: unknown): Promise<boolean>;
  abstract save(quote: Quote, tx?: unknown): Promise<void>;
  abstract delete(id: string, tx?: unknown): Promise<void>;
  /**
   * Read-only projection of the contracts context: is the quote bound by a
   * client contract, or by a consultant contract (on it or one of its subquotes)?
   */
  abstract hasContract(quoteId: string): Promise<boolean>;
  /** Highest numeric part of all request numbers (0 when there is none). */
  abstract lastRequestSequence(tx?: unknown): Promise<number>;
  abstract list(query: PageQuery, filter: QuoteListFilter): Promise<Page<Quote>>;
}
