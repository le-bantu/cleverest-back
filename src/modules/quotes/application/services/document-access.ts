import { ValidationException } from '@shared/kernel';
import { ActorContext } from '@shared/application/use-case';
import {
  DocumentViewer,
  Quote,
  QuoteActorRef,
  QuoteParties,
  QuoteRepository,
  quoteNotFound,
} from '../../domain';
import { toActorRef } from './quote-access';
import { loadQuote } from './quote-loader';

export interface DocumentContext {
  by: QuoteActorRef;
  viewer: DocumentViewer;
  quote: Quote;
  parties: QuoteParties;
}

/** Loads the quote and checks the caller is a party (client owner / assigned consultant / admin). */
export const loadDocumentContext = async (
  quotes: QuoteRepository,
  actor: ActorContext,
  quoteId: string,
): Promise<DocumentContext> => {
  const by = toActorRef(actor);
  const quote = await loadQuote(quotes, quoteId);
  if (!quote.canBeAccessedBy(by)) throw quoteNotFound(quoteId);
  return {
    by,
    viewer: { userId: by.actorId, actor: by.actor },
    quote,
    parties: { clientId: quote.clientId, consultantIds: quote.consultantIds },
  };
};

/** SPECIFIC visibility may only target parties of the quote. */
export const assertUsersAreParties = (userIds: readonly string[], parties: QuoteParties): void => {
  const allowed = new Set([parties.clientId, ...parties.consultantIds]);
  const invalid = userIds.filter((id) => !allowed.has(id));
  if (invalid.length) {
    throw new ValidationException(
      'VISIBILITY_USERS_INVALID',
      'Visible users must be the client or an assigned consultant of the quote',
      { ids: invalid },
    );
  }
};
