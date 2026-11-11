import { ValidationException } from '@shared/kernel';
import { ConsultantDirectoryPort } from '../../domain';

/** Ensures every id belongs to an active consultant (422 UNKNOWN_CONSULTANT otherwise). */
export const assertAreConsultants = async (
  directory: ConsultantDirectoryPort,
  ids: readonly string[],
): Promise<void> => {
  const unique = [...new Set(ids)];
  const found = new Set((await directory.findConsultantsByIds(unique)).map((c) => c.consultantId));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length) {
    throw new ValidationException('UNKNOWN_CONSULTANT', 'Some ids are not active consultants', {
      ids: missing,
    });
  }
};
