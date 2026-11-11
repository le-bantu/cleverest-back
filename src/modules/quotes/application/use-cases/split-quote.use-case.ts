import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import {
  CONSULTANT_DIRECTORY,
  ConsultantDirectoryPort,
  QUOTE_REPOSITORY,
  QuoteRepository,
  RequestNumberGenerator,
} from '../../domain';
import { SplitQuoteInput } from '../dto/quote.dto';
import { assertAreConsultants } from '../services/consultant-check';
import { QUOTE_PERMISSIONS, requireAdminWith } from '../services/quote-access';
import { QuoteCommitter } from '../services/quote-committer';
import { loadQuote } from '../services/quote-loader';
import { QuoteNotifications } from '../services/quote-notifications';
import { withRequestNumberRetry } from '../services/request-number-retry';
import { AdminQuoteDetailView, toAdminQuoteView } from '../views/quote.views';

/** One subquote per consultant; parent + children persisted atomically. */
@Injectable()
export class SplitQuoteUseCase implements UseCase<SplitQuoteInput, AdminQuoteDetailView> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(CONSULTANT_DIRECTORY) private readonly directory: ConsultantDirectoryPort,
    private readonly committer: QuoteCommitter,
    private readonly notifications: QuoteNotifications,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: SplitQuoteInput): Promise<AdminQuoteDetailView> {
    const by = requireAdminWith(input.actor, QUOTE_PERMISSIONS.ASSIGN);
    await assertAreConsultants(this.directory, input.consultants);

    const { parent, subquotes, now } = await withRequestNumberRetry(async () => {
      const quote = await loadQuote(this.quotes, input.quoteId);
      const at = this.clock.now();
      const numbers = RequestNumberGenerator.nextMany(
        await this.quotes.lastRequestSequence(),
        input.consultants.length,
      );
      const children = quote.split(
        input.consultants.map((consultantId, i) => ({
          id: this.quotes.nextIdentity(),
          requestNumber: numbers[i],
          consultantId,
        })),
        by,
        at,
      );
      await this.committer.commit([quote, ...children]);
      return { parent: quote, subquotes: children, now: at };
    });

    for (const sub of subquotes) {
      await this.notifications.toUsers(
        sub.consultantIds,
        sub,
        'Nouveau sous-devis assigné',
        'Un sous-devis vous a été assigné pour traitement.',
      );
    }
    return {
      ...toAdminQuoteView(parent, now),
      subquotes: subquotes.map((s) => toAdminQuoteView(s, now)),
    };
  }
}
