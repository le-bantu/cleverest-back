import { Inject, Injectable } from '@nestjs/common';
import { normalizePageQuery, Page } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import {
  parseQuoteStatus,
  parseQuoteType,
  QUOTE_REPOSITORY,
  QuoteActor,
  QuoteRepository,
} from '../../domain';
import { ListMyQuotesInput } from '../dto/quote.dto';
import { requireActor } from '../services/quote-access';
import { ClientQuoteView, toClientQuoteView } from '../views/quote.views';

/** A client's own main quotes (subquotes are an internal concern). */
@Injectable()
export class ListMyQuotesUseCase implements UseCase<ListMyQuotesInput, Page<ClientQuoteView>> {
  constructor(@Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository) {}

  async execute(input: ListMyQuotesInput): Promise<Page<ClientQuoteView>> {
    const by = requireActor(input.actor, QuoteActor.CLIENT);
    const page = await this.quotes.list(normalizePageQuery(input), {
      clientId: by.actorId,
      isSubquote: false,
      status: input.status ? parseQuoteStatus(input.status) : undefined,
      type: input.type ? parseQuoteType(input.type) : undefined,
      dateMin: input.dateMin,
      dateMax: input.dateMax,
      hasContract: input.hasContract,
    });
    return page.map(toClientQuoteView);
  }
}
