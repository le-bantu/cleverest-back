import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, normalizePageQuery, Page } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { parseQuoteStatus, parseQuoteType, QUOTE_REPOSITORY, QuoteRepository } from '../../domain';
import { ListAdminQuotesInput } from '../dto/quote.dto';
import { QUOTE_PERMISSIONS, requireAdminWith } from '../services/quote-access';
import { AdminQuoteView, toAdminQuoteView } from '../views/quote.views';

@Injectable()
export class ListAdminQuotesUseCase implements UseCase<ListAdminQuotesInput, Page<AdminQuoteView>> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ListAdminQuotesInput): Promise<Page<AdminQuoteView>> {
    requireAdminWith(input.actor, QUOTE_PERMISSIONS.MANAGE);
    const page = await this.quotes.list(normalizePageQuery(input), {
      clientId: input.clientId,
      status: input.status ? parseQuoteStatus(input.status) : undefined,
      type: input.type ? parseQuoteType(input.type) : undefined,
      dateMin: input.dateMin,
      dateMax: input.dateMax,
      isValidated: input.isValidated,
      isSubquote: input.isSubquote,
      parentQuoteId: input.parentQuoteId,
    });
    const now = this.clock.now();
    return page.map((q) => toAdminQuoteView(q, now));
  }
}
