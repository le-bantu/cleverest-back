import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/shared/interface/http/configure-app';
import { getTestPrisma, resetDb } from './test-db';

export interface TestApp {
  app: INestApplication;
  close: () => Promise<void>;
}

/** Boots the full Nest app against the test DB, wired exactly like production main.ts. */
export const createTestApp = async (
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<TestApp> => {
  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  // Bind explicitly to 127.0.0.1: supertest otherwise listens on an ephemeral port of `::`
  // and connects to 127.0.0.1, which another local process may already own (random 404s).
  await app.listen(0, '127.0.0.1');
  await resetDb();

  return {
    app,
    close: async () => {
      await app.close();
      await getTestPrisma().$disconnect();
    },
  };
};
