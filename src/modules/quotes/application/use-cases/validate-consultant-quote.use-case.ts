import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { parseQuoteStatus, QUOTE_REPOSITORY, QuoteRepository, QuoteStatus } from '../../domain';
import { ValidateConsultantQuoteInput } from '../dto/quote.dto';
import { QUOTE_PERMISSIONS, requireAdminWith } from '../services/quote-access';
import { QuoteCommitter } from '../services/quote-committer';
import { loadQuote } from '../services/quote-loader';
import { QuoteNotifications } from '../services/quote-notifications';
import { AdminQuoteView, toAdminQuoteView } from '../views/quote.views';

/** Admin rules on a COTÉ quote: VALIDÉ_ADMIN | REJETÉ | A_REVOIR_CONSULTANT. */
@Injectable()
export class ValidateConsultantQuoteUseCase implements UseCase<
  ValidateConsultantQuoteInput,
  AdminQuoteView
> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    private readonly committer: QuoteCommitter,
    private readonly notifications: QuoteNotifications,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ValidateConsultantQuoteInput): Promise<AdminQuoteView> {
    const by = requireAdminWith(input.actor, QUOTE_PERMISSIONS.MANAGE);
    const quote = await loadQuote(this.quotes, input.quoteId);
    const now = this.clock.now();

    quote.validateConsultantQuote(
      {
        status: parseQuoteStatus(input.status),
        adminNotes: input.adminNotes,
        adminNotesToConsultant: input.adminNotesToConsultant,
        rejectedReason: input.rejectedReason,
      },
      by,
      now,
    );
    await this.committer.commit([quote]);

    if (quote.status === QuoteStatus.A_REVOIR_CONSULTANT) {
      await this.notifications.toUsers(
        quote.consultantIds,
        quote,
        'Cotation à revoir',
        quote.adminNotesToConsultant ?? 'Votre cotation doit être révisée.',
      );
    } else if (quote.status === QuoteStatus.VALIDE_ADMIN && !quote.isSubquote) {
      await this.notifications.toUsers(
        [quote.clientId],
        quote,
        'Votre devis est prêt',
        `Le devis ${quote.requestNumber.value} a été validé et attend votre décision.`,
      );
    }
    return toAdminQuoteView(quote, now);
  }
}
