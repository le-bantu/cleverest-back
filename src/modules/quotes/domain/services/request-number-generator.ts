import { RequestNumber } from '../value-objects/request-number.vo';

/**
 * Computes the next request numbers from the highest sequence already used.
 * Pure: the repository supplies `lastSequence` (0 when no quote exists yet).
 */
export class RequestNumberGenerator {
  static next(lastSequence: number): RequestNumber {
    return RequestNumber.fromSequence(Math.max(0, Math.trunc(lastSequence)) + 1);
  }

  static nextMany(lastSequence: number, count: number): RequestNumber[] {
    const start = Math.max(0, Math.trunc(lastSequence));
    return Array.from({ length: count }, (_, i) => RequestNumber.fromSequence(start + i + 1));
  }
}
