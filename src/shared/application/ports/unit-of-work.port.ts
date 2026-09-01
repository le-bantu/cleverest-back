export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

/**
 * Runs a callback inside a single transaction. The callback receives a
 * transactional context (opaque to the application layer) that repositories
 * know how to consume.
 */
export abstract class UnitOfWorkPort {
  abstract run<T>(work: (tx: unknown) => Promise<T>): Promise<T>;
}
