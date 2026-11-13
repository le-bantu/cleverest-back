import { Inject, Injectable } from '@nestjs/common';
import { PendingWrite } from '@shared/application/pending-write';
import {
  CONSULTANT_DIRECTORY,
  ConsultantDirectoryPort,
  Money,
  parseQuoteType,
  Quote,
  QUOTE_REPOSITORY,
  QuoteActor,
  QuoteRepository,
  QuoteStatus,
  RequestNumberGenerator,
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
  parentQuoteId: string | null;
  /** validated price, EUR */
  price: number | null;
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
    return q ? this.toSummary(q) : null;
  }

  private toSummary(q: Quote): QuoteSummary {
    return {
      id: q.id,
      clientId: q.clientId,
      requestNumber: q.requestNumber.value,
      title: q.title,
      status: q.status,
      isSubquote: q.isSubquote,
      parentQuoteId: q.parentQuoteId,
      price: q.price?.amount ?? null,
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

  /**
   * A deal closed outside the platform (apporteur conversion): the quote is
   * created, validated by the admin at `price` (VALIDÉ_ADMIN) and signed by
   * the client (SIGNÉ_CLIENT) — through the regular state machine. Returns
   * the summary as it stood when validated (what a contract is drawn from).
   */
  async prepareClosedDealQuote(
    input: {
      clientId: string;
      title: string;
      description: string;
      type: string;
      price: number;
      adminId: string;
    },
    now: Date,
  ): Promise<PendingWrite & { validated: QuoteSummary }> {
    const quote = Quote.create(
      {
        id: this.quotes.nextIdentity(),
        clientId: input.clientId,
        requestNumber: RequestNumberGenerator.next(await this.quotes.lastRequestSequence()),
        type: parseQuoteType(input.type),
        title: input.title,
        description: input.description,
      },
      input.adminId,
      now,
    );
    const admin = { actorId: input.adminId, actor: QuoteActor.ADMIN };
    quote.reviewByAdmin(
      { status: QuoteStatus.VALIDE_ADMIN, price: Money.of(input.price) },
      admin,
      now,
    );
    const validated = this.toSummary(quote);
    quote.signByClient({ actorId: input.clientId, actor: QuoteActor.CLIENT }, now);
    return {
      validated,
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
