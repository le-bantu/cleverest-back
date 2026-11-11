/** The quote as the contracts context needs to see it. */
export interface QuoteForContract {
  id: string;
  clientId: string;
  requestNumber: string;
  status: string;
  isSubquote: boolean;
  /** status is VALIDÉ_ADMIN */
  readyForContract: boolean;
  /** main quote of a subquote, null for a main quote */
  parentQuoteId: string | null;
  /** price validated on this quote (for a subquote: the consultant's price) */
  price: number | null;
  consultantIds: string[];
  /** an admin validated the price: VALIDÉ_ADMIN or SIGNÉ_CLIENT */
  priceValidated: boolean;
}

/** A quote status change persisted inside the contract's transaction. */
export interface PendingQuoteSignature {
  persist(tx: unknown): Promise<void>;
  finalize(): Promise<void>;
}

/** PORT to the quotes context. */
export abstract class QuoteGatewayPort {
  abstract findQuote(quoteId: string): Promise<QuoteForContract | null>;
  /** Validates VALIDÉ_ADMIN → SIGNÉ_CLIENT for this client now (throws 409/403), writes nothing. */
  abstract prepareClientSignature(
    quoteId: string,
    clientId: string,
    now: Date,
  ): Promise<PendingQuoteSignature>;
}

export const QUOTE_GATEWAY = Symbol('CONTRACTS_QUOTE_GATEWAY');
