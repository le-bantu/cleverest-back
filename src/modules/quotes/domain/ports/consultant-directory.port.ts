import { ConsultantCandidate } from '../services/consultant-shortlisting.service';

export const CONSULTANT_DIRECTORY = Symbol('CONSULTANT_DIRECTORY');

/**
 * Cross-module PORT onto identity-access: read-only view of consultants.
 * Only active, non-deleted users holding the `consultant` role are returned.
 */
export abstract class ConsultantDirectoryPort {
  abstract listConsultants(): Promise<ConsultantCandidate[]>;
  abstract findConsultantsByIds(ids: readonly string[]): Promise<ConsultantCandidate[]>;
}
