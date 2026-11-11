import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { Money, QUOTE_REPOSITORY, QuoteActor, QuoteRepository, quoteNotFound } from '../../domain';
import { SubmitConsultantQuoteInput } from '../dto/quote.dto';
import { requireActor } from '../services/quote-access';
import { QuoteCommitter } from '../services/quote-committer';
import { loadQuote } from '../services/quote-loader';
import { ConsultantQuoteView, toConsultantQuoteView } from '../views/quote.views';

/** Assigned consultant submits a price → COTÉ (refused past the consultant deadline). */
@Injectable()
export class SubmitConsultantQuoteUseCase implements UseCase<
  SubmitConsultantQuoteInput,
  ConsultantQuoteView
> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    private readonly committer: QuoteCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: SubmitConsultantQuoteInput): Promise<ConsultantQuoteView> {
    const by = requireActor(input.actor, QuoteActor.CONSULTANT);
    const quote = await loadQuote(this.quotes, input.quoteId);
    if (!quote.canBeAccessedBy(by)) throw quoteNotFound(input.quoteId);
    const now = this.clock.now();

    quote.submitByConsultant(
      { price: Money.of(input.price), consultantNotes: input.consultantNotes },
      by,
      now,
    );
    await this.committer.commit([quote]);
    return toConsultantQuoteView(quote, by.actorId, now);
  }
}
