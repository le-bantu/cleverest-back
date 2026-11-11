import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case';
import {
  QUOTE_DOCUMENT_REPOSITORY,
  QUOTE_REPOSITORY,
  QuoteDocumentRepository,
  QuoteRepository,
} from '../../domain';
import { QuoteRef } from '../dto/quote.dto';
import { loadDocumentContext } from '../services/document-access';
import { QuoteDocumentView, toQuoteDocumentView } from '../views/quote.views';

/** Documents of a quote filtered by the caller's visibility. */
@Injectable()
export class ListQuoteDocumentsUseCase implements UseCase<QuoteRef, QuoteDocumentView[]> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(QUOTE_DOCUMENT_REPOSITORY) private readonly documents: QuoteDocumentRepository,
  ) {}

  async execute(input: QuoteRef): Promise<QuoteDocumentView[]> {
    const { viewer, parties, quote } = await loadDocumentContext(
      this.quotes,
      input.actor,
      input.quoteId,
    );
    const all = await this.documents.listByQuote(quote.id);
    return all.filter((d) => d.isVisibleTo(viewer, parties)).map(toQuoteDocumentView);
  }
}
