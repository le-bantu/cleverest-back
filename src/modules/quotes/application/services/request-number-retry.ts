import { DomainException } from '@shared/kernel';

export const REQUEST_NUMBER_TAKEN = 'REQUEST_NUMBER_TAKEN';
const MAX_ATTEMPTS = 3;

/**
 * Request numbers are computed from the current maximum; two concurrent
 * creations may race. The repository maps the unique violation to
 * REQUEST_NUMBER_TAKEN and we simply recompute and retry.
 */
export const withRequestNumberRetry = async <T>(work: () => Promise<T>): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      const taken = error instanceof DomainException && error.code === REQUEST_NUMBER_TAKEN;
      if (!taken || attempt >= MAX_ATTEMPTS) throw error;
    }
  }
};
