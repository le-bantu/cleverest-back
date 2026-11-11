import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, normalizePageQuery, Page } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { parseQuoteStatus, QUOTE_REPOSITORY, QuoteActor, QuoteRepository } from '../../domain';
import { ListConsultantQuotesInput } from '../dto/quote.dto';
import { requireActor } from '../services/quote-access';
import { ConsultantQuoteView, toConsultantQuoteView } from '../views/quote.views';

/** (Sub)quotes the consultant is assigned to. */
@Injectable()
export class ListConsultantQuotesUseCase implements UseCase<
  ListConsultantQuotesInput,
  Page<ConsultantQuoteView>
> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ListConsultantQuotesInput): Promise<Page<ConsultantQuoteView>> {
    const by = requireActor(input.actor, QuoteActor.CONSULTANT);
    const page = await this.quotes.list(normalizePageQuery(input), {
      consultantId: by.actorId,
      status: input.status ? parseQuoteStatus(input.status) : undefined,
      isSubquote: input.isSubquote,
      isValidated: input.isValidated,
      hasContract: input.hasContract,
    });
    const now = this.clock.now();
    return page.map((q) => toConsultantQuoteView(q, by.actorId, now));
  }
}
