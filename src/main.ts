import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { configureApplication } from './bootstrap.js';
import type { EnvironmentVariables } from './config/environment.schema.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  app.useLogger(logger);
  configureApplication(app, config);

  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : 'Unknown startup error';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
