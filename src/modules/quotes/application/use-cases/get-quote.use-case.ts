import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { QUOTE_REPOSITORY, QuoteActor, QuoteRepository, quoteNotFound } from '../../domain';
import { QuoteRef } from '../dto/quote.dto';
import { QUOTE_PERMISSIONS, requireAdminWith, toActorRef } from '../services/quote-access';
import { loadQuote } from '../services/quote-loader';
import {
  AdminQuoteDetailView,
  ClientQuoteView,
  ConsultantQuoteView,
  toAdminQuoteView,
  toClientQuoteView,
  toConsultantQuoteView,
} from '../views/quote.views';

export type QuoteView = ClientQuoteView | ConsultantQuoteView | AdminQuoteDetailView;

/**
 * Returns the view matching the caller: client (owner, main quotes only),
 * consultant (assigned) or admin (`manage-quotes`, with subquotes).
 * A non-accessible quote is reported as 404 to avoid leaking its existence.
 */
@Injectable()
export class GetQuoteUseCase implements UseCase<QuoteRef, QuoteView> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: QuoteRef): Promise<QuoteView> {
    const by = toActorRef(input.actor);
    if (by.actor === QuoteActor.ADMIN) requireAdminWith(input.actor, QUOTE_PERMISSIONS.MANAGE);

    const quote = await loadQuote(this.quotes, input.quoteId);
    const now = this.clock.now();
    const hiddenSubquote = by.actor === QuoteActor.CLIENT && quote.isSubquote;
    if (!quote.canBeAccessedBy(by) || hiddenSubquote) throw quoteNotFound(input.quoteId);

    switch (by.actor) {
      case QuoteActor.CLIENT:
        return toClientQuoteView(quote);
      case QuoteActor.CONSULTANT:
        return toConsultantQuoteView(quote, by.actorId, now);
      default: {
        const subquotes = quote.isSubquote ? [] : await this.quotes.findSubquotes(quote.id);
        return {
          ...toAdminQuoteView(quote, now),
          subquotes: subquotes.map((s) => toAdminQuoteView(s, now)),
        };
      }
    }
  }
}
