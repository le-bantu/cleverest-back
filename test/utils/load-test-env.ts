import { config as loadEnv } from 'dotenv';
import * as path from 'path';

/** Loads .env.test (falling back to .env) for integration/e2e runs. */
export const loadTestEnv = (): void => {
  process.env.NODE_ENV = 'test';
  loadEnv({ path: path.resolve(__dirname, '../../.env.test') });
  loadEnv({ path: path.resolve(__dirname, '../../.env') });
};
