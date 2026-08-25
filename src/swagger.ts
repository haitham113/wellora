import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import type { EnvironmentVariables } from './config/environment.schema.js';

export function setupSwagger(
  app: INestApplication,
  config: ConfigService<EnvironmentVariables, true>,
): void {
  if (!config.get('SWAGGER_ENABLED', { infer: true })) {
    return;
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Wellora Marketplace API')
    .setDescription('B2B employee-benefits marketplace REST API')
    .setVersion('0.3.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: { persistAuthorization: false },
  });
}
