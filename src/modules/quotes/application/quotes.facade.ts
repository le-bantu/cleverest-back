import { Inject, Injectable } from '@nestjs/common';
import {
  CONSULTANT_DIRECTORY,
  ConsultantDirectoryPort,
  QUOTE_REPOSITORY,
  QuoteActor,
  QuoteRepository,
  QuoteStatus,
} from '../domain';
import { QuoteCommitter } from './services/quote-committer';
import { loadQuote } from './services/quote-loader';

/** What other contexts may know about a quote. */
export interface QuoteSummary {
  id: string;
  clientId: string;
  requestNumber: string;
  title: string | null;
  status: QuoteStatus;
  isSubquote: boolean;
  leadConsultantId: string | null;
  consultantIds: string[];
}

/** A quote change prepared by another context, persisted inside that context's transaction. */
export interface PendingQuoteChange {
  persist(tx: unknown): Promise<void>;
  /** audit + events, to call once the transaction committed */
  finalize(): Promise<void>;
}

/**
 * Public API of the quotes context for contracts / missions. Other modules
 * never touch the Quote aggregate or its repository directly.
 */
@Injectable()
export class QuotesFacade {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(CONSULTANT_DIRECTORY) private readonly directory: ConsultantDirectoryPort,
    private readonly committer: QuoteCommitter,
  ) {}

  async findSummary(quoteId: string): Promise<QuoteSummary | null> {
    const q = await this.quotes.findById(quoteId);
    if (!q) return null;
    return {
      id: q.id,
      clientId: q.clientId,
      requestNumber: q.requestNumber.value,
      title: q.title,
      status: q.status,
      isSubquote: q.isSubquote,
      leadConsultantId: q.leadConsultantId,
      consultantIds: q.consultantIds,
    };
  }

  /**
   * VALIDÉ_ADMIN → SIGNÉ_CLIENT by the owning client. The state machine is
   * checked now (409 / 403 thrown before anything is written).
   */
  async prepareClientSignature(
    quoteId: string,
    clientId: string,
    now: Date,
  ): Promise<PendingQuoteChange> {
    const quote = await loadQuote(this.quotes, quoteId);
    quote.signByClient({ actorId: clientId, actor: QuoteActor.CLIENT }, now);
    return {
      persist: (tx) => this.quotes.save(quote, tx),
      finalize: () => this.committer.afterCommit([quote]),
    };
  }

  /** Ids among `ids` that are active consultants. */
  async existingConsultants(ids: readonly string[]): Promise<string[]> {
    if (!ids.length) return [];
    return (await this.directory.findConsultantsByIds(ids)).map((c) => c.consultantId);
  }
}
