/** PORT to the quotes context: the team that quoted the work. */
export abstract class QuoteTeamPort {
  /** Lead consultant of the quote (pre-fills the mission lead), or null. */
  abstract leadConsultantOf(quoteId: string): Promise<string | null>;
  /** Ids among `ids` that are active consultants. */
  abstract existingConsultants(ids: readonly string[]): Promise<string[]>;
}

export const QUOTE_TEAM = Symbol('MISSIONS_QUOTE_TEAM');
