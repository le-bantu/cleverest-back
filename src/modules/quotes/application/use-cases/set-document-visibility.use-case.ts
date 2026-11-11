import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case';
import {
  DocumentVisibility,
  documentNotFound,
  QUOTE_DOCUMENT_REPOSITORY,
  QUOTE_REPOSITORY,
  QuoteActor,
  QuoteDocumentRepository,
  QuoteRepository,
  VisibleTo,
} from '../../domain';
import { SetDocumentVisibilityInput } from '../dto/quote.dto';
import { assertUsersAreParties } from '../services/document-access';
import { requireActor } from '../services/quote-access';
import { loadQuote } from '../services/quote-loader';
import { QuoteDocumentView, toQuoteDocumentView } from '../views/quote.views';

@Injectable()
export class SetDocumentVisibilityUseCase implements UseCase<
  SetDocumentVisibilityInput,
  QuoteDocumentView
> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(QUOTE_DOCUMENT_REPOSITORY) private readonly documents: QuoteDocumentRepository,
  ) {}

  async execute(input: SetDocumentVisibilityInput): Promise<QuoteDocumentView> {
    const by = requireActor(input.actor, QuoteActor.ADMIN);
    const document = await this.documents.findById(input.documentId);
    if (!document) throw documentNotFound(input.documentId);

    const visibility = DocumentVisibility.create(input.visibleTo, input.visibleUsers ?? []);
    if (visibility.visibleTo === VisibleTo.SPECIFIC) {
      const quote = await loadQuote(this.quotes, document.quoteId);
      assertUsersAreParties(visibility.userIds, {
        clientId: quote.clientId,
        consultantIds: quote.consultantIds,
      });
    }
    document.changeVisibility(visibility, { userId: by.actorId, actor: by.actor });
    await this.documents.save(document);
    return toQuoteDocumentView(document);
  }
}
