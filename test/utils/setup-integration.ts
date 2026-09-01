import { loadTestEnv } from './load-test-env';
import { resetDb, disconnectTestPrisma } from './test-db';

loadTestEnv();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectTestPrisma();
});
