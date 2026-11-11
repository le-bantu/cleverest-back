import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import {
  parseQuoteType,
  Quote,
  QUOTE_REPOSITORY,
  QuoteActor,
  QuoteRepository,
  RequestNumberGenerator,
} from '../../domain';
import { CreateQuoteInput } from '../dto/quote.dto';
import { requireActor } from '../services/quote-access';
import { QuoteCommitter } from '../services/quote-committer';
import { withRequestNumberRetry } from '../services/request-number-retry';
import { ClientQuoteView, toClientQuoteView } from '../views/quote.views';

@Injectable()
export class CreateQuoteUseCase implements UseCase<CreateQuoteInput, ClientQuoteView> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    private readonly committer: QuoteCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateQuoteInput): Promise<ClientQuoteView> {
    const by = requireActor(input.actor, QuoteActor.CLIENT);
    const type = parseQuoteType(input.type);

    const quote = await withRequestNumberRetry(async () => {
      const last = await this.quotes.lastRequestSequence();
      const created = Quote.create(
        {
          id: this.quotes.nextIdentity(),
          clientId: by.actorId,
          requestNumber: RequestNumberGenerator.next(last),
          type,
          title: input.title,
          description: input.description,
        },
        by.actorId,
        this.clock.now(),
      );
      await this.committer.commit([created]);
      return created;
    });
    return toClientQuoteView(quote);
  }
}
