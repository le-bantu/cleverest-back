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
 * Client decision on a VALIDÉ_ADMIN quote. Only `reject` remains here: signing
 * is contract-level (`PATCH /contracts/{id}`), the single signature path.
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
    if (input.action === 'sign') {
      throw new ValidationException(
        'SIGN_VIA_CONTRACT',
        'A quote is signed by uploading the signed contract (PATCH /contracts/{id})',
      );
    }
    if (input.action !== 'reject') {
      throw new ValidationException('INVALID_ACTION', 'action must be "reject"');
    }
    const quote = await loadQuote(this.quotes, input.quoteId);
    if (!quote.isOwnedBy(by.actorId) || quote.isSubquote) throw quoteNotFound(input.quoteId);

    quote.rejectByClient(input.rejectedReason, by, this.clock.now());
    await this.committer.commit([quote]);
    return toClientQuoteView(quote);
  }
}
