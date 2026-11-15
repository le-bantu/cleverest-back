import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { Env } from '@shared/infrastructure/config/env.schema';

/** Builds the OpenAPI document of the whole API (also exported by `npm run openapi:export`). */
export const buildOpenApiDocument = (app: INestApplication): OpenAPIObject =>
  SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Cleverest API')
      .setDescription(
        'NestJS / Clean Architecture / DDD backend. Errors: `{ statusCode, error, message, details?, path, timestamp }`.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );

/**
 * HTTP wiring shared by `main.ts` and the e2e test app, so tests run against the
 * production configuration: prefix, validation, security headers, CORS, proxy trust, docs.
 */
export const configureApp = (app: NestExpressApplication): void => {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const prefix = config.get('API_PREFIX', { infer: true });
  app.setGlobalPrefix(prefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // JSON API only: no inline content to protect, so the strictest CSP; Swagger UI needs its own
  app.use(`/${prefix}/docs`, helmet({ contentSecurityPolicy: false }));
  app.use(helmet());
  app.disable('x-powered-by');

  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy > 0) app.set('trust proxy', trustProxy);

  const origins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length) {
    app.enableCors({
      origin: origins,
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      exposedHeaders: ['Content-Disposition'],
    });
  }

  const swagger =
    config.get('SWAGGER_ENABLED', { infer: true }) ??
    config.get('NODE_ENV', { infer: true }) !== 'production';
  if (swagger) SwaggerModule.setup(`${prefix}/docs`, app, buildOpenApiDocument(app));

  app.enableShutdownHooks();
};
