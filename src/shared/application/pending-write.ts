/**
 * A change prepared by one bounded context and written inside ANOTHER
 * context's transaction (UnitOfWork). Business rules are checked when it is
 * prepared — nothing is written until `persist(tx)`; side effects (audit,
 * events, notifications) run in `finalize()` once the transaction committed.
 */
export interface PendingWrite {
  persist(tx: unknown): Promise<void>;
  finalize(): Promise<void>;
}
