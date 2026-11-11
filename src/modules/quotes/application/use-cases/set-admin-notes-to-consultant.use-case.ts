import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { QUOTE_REPOSITORY, QuoteRepository } from '../../domain';
import { SetAdminNotesToConsultantInput } from '../dto/quote.dto';
import { QUOTE_PERMISSIONS, requireAdminWith } from '../services/quote-access';
import { QuoteCommitter } from '../services/quote-committer';
import { loadQuote } from '../services/quote-loader';
import { QuoteNotifications } from '../services/quote-notifications';
import { AdminQuoteView, toAdminQuoteView } from '../views/quote.views';

@Injectable()
export class SetAdminNotesToConsultantUseCase implements UseCase<
  SetAdminNotesToConsultantInput,
  AdminQuoteView
> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    private readonly committer: QuoteCommitter,
    private readonly notifications: QuoteNotifications,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: SetAdminNotesToConsultantInput): Promise<AdminQuoteView> {
    const by = requireAdminWith(input.actor, QUOTE_PERMISSIONS.MANAGE);
    const quote = await loadQuote(this.quotes, input.quoteId);
    const now = this.clock.now();
    quote.setAdminNotesToConsultant(input.adminNotesToConsultant, by, now);
    await this.committer.commit([quote]);
    await this.notifications.toUsers(
      quote.consultantIds,
      quote,
      "Nouvelle note de l'administrateur",
      quote.adminNotesToConsultant ?? '',
    );
    return toAdminQuoteView(quote, now);
  }
}
