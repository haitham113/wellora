import { RequestMethod, ValidationPipe, type INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

import { requestIdMiddleware } from './common/http/request-id.middleware.js';
import type { EnvironmentVariables } from './config/environment.schema.js';

export function configureApplication(
  app: INestApplication,
  config: ConfigService<EnvironmentVariables, true>,
): void {
  app.use(requestIdMiddleware);
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.use(helmet());
  app.enableCors({
    credentials: true,
    origin: config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim()),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.enableShutdownHooks();
}
