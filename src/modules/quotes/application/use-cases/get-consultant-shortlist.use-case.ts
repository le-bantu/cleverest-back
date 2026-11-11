import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case';
import {
  CONSULTANT_DIRECTORY,
  CONSULTANT_WORKLOAD,
  ConsultantDirectoryPort,
  ConsultantShortlistingService,
  ConsultantWorkloadPort,
  QUOTE_REPOSITORY,
  QuoteRepository,
} from '../../domain';
import { QuoteRef } from '../dto/quote.dto';
import { QUOTE_PERMISSIONS, requireAdminWith } from '../services/quote-access';
import { loadQuote } from '../services/quote-loader';
import { ShortlistView } from '../views/quote.views';

/** Read-only: proposes ranked consultants, never assigns (no side effect). */
@Injectable()
export class GetConsultantShortlistUseCase implements UseCase<QuoteRef, ShortlistView> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(CONSULTANT_DIRECTORY) private readonly directory: ConsultantDirectoryPort,
    @Inject(CONSULTANT_WORKLOAD) private readonly workload: ConsultantWorkloadPort,
  ) {}

  async execute(input: QuoteRef): Promise<ShortlistView> {
    requireAdminWith(input.actor, QUOTE_PERMISSIONS.ASSIGN);
    const quote = await loadQuote(this.quotes, input.quoteId);
    const candidates = await this.directory.listConsultants();
    const loads = await this.workload.currentLoad(candidates.map((c) => c.consultantId));
    return ConsultantShortlistingService.shortlist(
      { type: quote.type, title: quote.title, description: quote.description },
      candidates,
      loads,
    );
  }
}
