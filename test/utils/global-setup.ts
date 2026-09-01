import { execSync } from 'child_process';
import * as path from 'path';
import { loadTestEnv } from './load-test-env';

/**
 * Runs once before the integration / e2e suites: applies migrations to the
 * dedicated test database (docker-compose `postgres-test`, port 5433).
 */
export default function globalSetup(): void {
  loadTestEnv();
  const cwd = path.resolve(__dirname, '../..');
  execSync('npx prisma migrate deploy', {
    cwd,
    stdio: 'inherit',
    env: { ...process.env },
  });
}
