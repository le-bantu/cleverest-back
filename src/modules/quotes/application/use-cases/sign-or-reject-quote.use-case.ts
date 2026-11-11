import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, ValidationException } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { QUOTE_REPOSITORY, QuoteActor, QuoteRepository, quoteNotFound } from '../../domain';
import { SignOrRejectQuoteInput } from '../dto/quote.dto';
import { requireActor } from '../services/quote-access';
import { QuoteCommitter } from '../services/quote-committer';
import { loadQuote } from '../services/quote-loader';
import { ClientQuoteView, toClientQuoteView } from '../views/quote.views';

/**
 * Client decision on a VALIDÉ_ADMIN quote. NB: `sign` becomes contract-level
 * in Lot 3 (single signature path); `reject` stays here.
 */
@Injectable()
export class SignOrRejectQuoteUseCase implements UseCase<SignOrRejectQuoteInput, ClientQuoteView> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    private readonly committer: QuoteCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: SignOrRejectQuoteInput): Promise<ClientQuoteView> {
    const by = requireActor(input.actor, QuoteActor.CLIENT);
    const quote = await loadQuote(this.quotes, input.quoteId);
    if (!quote.isOwnedBy(by.actorId) || quote.isSubquote) throw quoteNotFound(input.quoteId);
    const now = this.clock.now();

    if (input.action === 'sign') quote.signByClient(by, now);
    else if (input.action === 'reject') quote.rejectByClient(input.rejectedReason, by, now);
    else throw new ValidationException('INVALID_ACTION', 'action must be "sign" or "reject"');

    await this.committer.commit([quote]);
    return toClientQuoteView(quote);
  }
}
