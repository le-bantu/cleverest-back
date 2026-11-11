import { Quote, quoteNotFound, QuoteRepository } from '../../domain';

export const loadQuote = async (
  quotes: QuoteRepository,
  quoteId: string,
  tx?: unknown,
): Promise<Quote> => {
  const quote = await quotes.findById(quoteId, tx);
  if (!quote) throw quoteNotFound(quoteId);
  return quote;
};
