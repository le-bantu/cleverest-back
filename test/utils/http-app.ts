import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/shared/interface/http/filters/all-exceptions.filter';
import { getTestPrisma, resetDb } from './test-db';

export interface TestApp {
  app: INestApplication;
  close: () => Promise<void>;
}

/** Boots the full Nest app against the test DB, wired like production main.ts. */
export const createTestApp = async (): Promise<TestApp> => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
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
