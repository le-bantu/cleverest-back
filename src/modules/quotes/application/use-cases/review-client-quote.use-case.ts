import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import {
  Money,
  parseQuoteStatus,
  QUOTE_REPOSITORY,
  QuoteRepository,
  QuoteStatus,
} from '../../domain';
import { ReviewClientQuoteInput } from '../dto/quote.dto';
import { QUOTE_PERMISSIONS, requireAdminWith } from '../services/quote-access';
import { QuoteCommitter } from '../services/quote-committer';
import { loadQuote } from '../services/quote-loader';
import { QuoteNotifications } from '../services/quote-notifications';
import { AdminQuoteView, toAdminQuoteView } from '../views/quote.views';

/** Admin reviews a client request. `price` is only needed to validate. */
@Injectable()
export class ReviewClientQuoteUseCase implements UseCase<ReviewClientQuoteInput, AdminQuoteView> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    private readonly committer: QuoteCommitter,
    private readonly notifications: QuoteNotifications,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ReviewClientQuoteInput): Promise<AdminQuoteView> {
    const by = requireAdminWith(input.actor, QUOTE_PERMISSIONS.MANAGE);
    const quote = await loadQuote(this.quotes, input.quoteId);
    const before = quote.status;
    const now = this.clock.now();

    quote.reviewByAdmin(
      {
        status: parseQuoteStatus(input.status),
        adminNotes: input.adminNotes,
        adminNotesToConsultant: input.adminNotesToConsultant,
        adminNotesToClient: input.adminNotesToClient,
        rejectedReason: input.rejectedReason,
        description: input.description,
        price: input.price === undefined || input.price === null ? null : Money.of(input.price),
      },
      by,
      now,
    );
    await this.committer.commit([quote]);

    if (quote.status !== before) {
      if (quote.status === QuoteStatus.TRAITEMENT_CONSULTANT) {
        await this.notifications.toUsers(
          quote.consultantIds,
          quote,
          'Nouveau devis à traiter',
          'Un devis vous a été transmis pour cotation.',
        );
      } else {
        await this.notifications.toUsers(
          [quote.clientId],
          quote,
          'Mise à jour de votre devis',
          `Votre devis ${quote.requestNumber.value} est maintenant ${quote.status}.`,
        );
      }
    }
    return toAdminQuoteView(quote, now);
  }
}
