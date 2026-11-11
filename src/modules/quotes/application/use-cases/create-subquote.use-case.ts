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
import { CreateSubquoteInput } from '../dto/quote.dto';
import { assertAreConsultants } from '../services/consultant-check';
import { QUOTE_PERMISSIONS, requireAdminWith } from '../services/quote-access';
import { QuoteCommitter } from '../services/quote-committer';
import { loadQuote } from '../services/quote-loader';
import { QuoteNotifications } from '../services/quote-notifications';
import { withRequestNumberRetry } from '../services/request-number-retry';
import { AdminQuoteView, toAdminQuoteView } from '../views/quote.views';

@Injectable()
export class CreateSubquoteUseCase implements UseCase<CreateSubquoteInput, AdminQuoteView> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(CONSULTANT_DIRECTORY) private readonly directory: ConsultantDirectoryPort,
    private readonly committer: QuoteCommitter,
    private readonly notifications: QuoteNotifications,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateSubquoteInput): Promise<AdminQuoteView> {
    const by = requireAdminWith(input.actor, QUOTE_PERMISSIONS.ASSIGN);
    await assertAreConsultants(this.directory, [input.consultantId]);

    const { subquote, now } = await withRequestNumberRetry(async () => {
      const parent = await loadQuote(this.quotes, input.quoteId);
      const at = this.clock.now();
      const child = parent.createSubquote(
        {
          id: this.quotes.nextIdentity(),
          requestNumber: RequestNumberGenerator.next(await this.quotes.lastRequestSequence()),
          title: input.title,
          description: input.description,
          consultantId: input.consultantId,
          consultantDeadline: input.consultantDeadline,
        },
        by,
        at,
      );
      await this.committer.commit([parent, child]);
      return { subquote: child, now: at };
    });

    await this.notifications.toUsers(
      [input.consultantId],
      subquote,
      'Nouveau sous-devis assigné',
      'Un sous-devis vous a été assigné pour traitement.',
    );
    return toAdminQuoteView(subquote, now);
  }
}
