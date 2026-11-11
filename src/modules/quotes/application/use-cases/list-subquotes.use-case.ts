import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import {
  QUOTE_DOCUMENT_REPOSITORY,
  QUOTE_REPOSITORY,
  QuoteDocumentRepository,
  QuoteRepository,
} from '../../domain';
import { QuoteRef } from '../dto/quote.dto';
import { QUOTE_PERMISSIONS, requireAdminWith } from '../services/quote-access';
import { loadQuote } from '../services/quote-loader';
import {
  SubquoteWithDocumentsView,
  toAdminQuoteView,
  toQuoteDocumentView,
} from '../views/quote.views';

@Injectable()
export class ListSubquotesUseCase implements UseCase<QuoteRef, SubquoteWithDocumentsView[]> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(QUOTE_DOCUMENT_REPOSITORY) private readonly documents: QuoteDocumentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: QuoteRef): Promise<SubquoteWithDocumentsView[]> {
    requireAdminWith(input.actor, QUOTE_PERMISSIONS.MANAGE);
    const parent = await loadQuote(this.quotes, input.quoteId);
    const subquotes = await this.quotes.findSubquotes(parent.id);
    const now = this.clock.now();
    return Promise.all(
      subquotes.map(async (s) => ({
        ...toAdminQuoteView(s, now),
        documents: (await this.documents.listByQuote(s.id)).map(toQuoteDocumentView),
      })),
    );
  }
}
