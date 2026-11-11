import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import {
  CONSULTANT_DIRECTORY,
  ConsultantDirectoryPort,
  ConsultantsAssignedToQuote,
  QUOTE_REPOSITORY,
  QuoteRepository,
} from '../../domain';
import { AssignConsultantsInput } from '../dto/quote.dto';
import { assertAreConsultants } from '../services/consultant-check';
import { QUOTE_PERMISSIONS, requireAdminWith } from '../services/quote-access';
import { QuoteCommitter } from '../services/quote-committer';
import { loadQuote } from '../services/quote-loader';
import { QuoteNotifications } from '../services/quote-notifications';
import { AdminQuoteView, toAdminQuoteView } from '../views/quote.views';

/** Sync semantics: the given list replaces the current assignments (≤ 1 lead). */
@Injectable()
export class AssignConsultantsUseCase implements UseCase<AssignConsultantsInput, AdminQuoteView> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(CONSULTANT_DIRECTORY) private readonly directory: ConsultantDirectoryPort,
    private readonly committer: QuoteCommitter,
    private readonly notifications: QuoteNotifications,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: AssignConsultantsInput): Promise<AdminQuoteView> {
    const by = requireAdminWith(input.actor, QUOTE_PERMISSIONS.ASSIGN);
    await assertAreConsultants(
      this.directory,
      input.consultants.map((c) => c.id),
    );
    const quote = await loadQuote(this.quotes, input.quoteId);
    const now = this.clock.now();

    quote.assignConsultants(
      input.consultants.map((c) => ({ consultantId: c.id, isLead: c.isLead === true })),
      by,
      now,
      input.consultantDeadline,
    );
    const assigned = quote.domainEvents.find(
      (e): e is ConsultantsAssignedToQuote => e instanceof ConsultantsAssignedToQuote,
    );
    await this.committer.commit([quote]);

    await this.notifications.toUsers(
      assigned?.data.newlyAssignedIds ?? [],
      quote,
      'Nouveau devis assigné',
      'Un devis vous a été assigné pour traitement.',
    );
    return toAdminQuoteView(quote, now);
  }
}
