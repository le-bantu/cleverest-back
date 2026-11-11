import { Injectable } from '@nestjs/common';
import { QuotesFacade } from '@modules/quotes/application/quotes.facade';
import { QuoteStatus } from '@modules/quotes/domain';
import { PendingQuoteSignature, QuoteForContract, QuoteGatewayPort } from '../../domain';

/** Contracts → quotes, through the quotes public facade only. */
@Injectable()
export class QuotesGatewayAdapter extends QuoteGatewayPort {
  constructor(private readonly quotes: QuotesFacade) {
    super();
  }

  async findQuote(quoteId: string): Promise<QuoteForContract | null> {
    const q = await this.quotes.findSummary(quoteId);
    if (!q) return null;
    return {
      id: q.id,
      clientId: q.clientId,
      requestNumber: q.requestNumber,
      status: q.status,
      isSubquote: q.isSubquote,
      readyForContract: q.status === QuoteStatus.VALIDE_ADMIN,
    };
  }

  prepareClientSignature(
    quoteId: string,
    clientId: string,
    now: Date,
  ): Promise<PendingQuoteSignature> {
    return this.quotes.prepareClientSignature(quoteId, clientId, now);
  }
}
