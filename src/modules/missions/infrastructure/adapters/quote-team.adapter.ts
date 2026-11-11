import { Injectable } from '@nestjs/common';
import { QuotesFacade } from '@modules/quotes/application/quotes.facade';
import { QuoteTeamPort } from '../../domain';

/** Missions → quotes (lead of the quote, consultant directory), through the facade only. */
@Injectable()
export class QuoteTeamAdapter extends QuoteTeamPort {
  constructor(private readonly quotes: QuotesFacade) {
    super();
  }

  async leadConsultantOf(quoteId: string): Promise<string | null> {
    return (await this.quotes.findSummary(quoteId))?.leadConsultantId ?? null;
  }

  existingConsultants(ids: readonly string[]): Promise<string[]> {
    return this.quotes.existingConsultants(ids);
  }
}
