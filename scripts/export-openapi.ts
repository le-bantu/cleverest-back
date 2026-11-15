/**
 * Writes the OpenAPI document to `openapi.json` (or the path given as argument) without
 * starting the server nor touching the database (`preview` mode: no provider is instantiated).
 */
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/shared/interface/http/configure-app';

async function main(): Promise<void> {
  const out = process.argv[2] ?? 'openapi.json';
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });
  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api');
  const doc = buildOpenApiDocument(app);
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`${out}: ${Object.keys(doc.paths).length} paths`);
  await app.close();
}

void main();
