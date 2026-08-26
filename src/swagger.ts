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
    .setDescription(
      'B2B employee-benefits marketplace REST API. Collection responses use { data, meta }. Marketplace catalog pagination starts at page 1, caps limit at 100 and page at 10,000, and uses next/previous-page indicators without an expensive exact count. Monetary amounts are decimal strings in integer minor units and must be interpreted with their ISO 4217 currency.',
    )
    .setVersion('0.5.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: { persistAuthorization: false },
  });
}
