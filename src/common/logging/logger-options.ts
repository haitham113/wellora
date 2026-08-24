import type { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';

import type { EnvironmentVariables } from '../../config/environment.schema.js';
import { resolveRequestId } from '../http/request-id.middleware.js';

export function buildLoggerOptions(config: ConfigService<EnvironmentVariables, true>): Params {
  const environment = config.get('NODE_ENV', { infer: true });
  const level = config.get('LOG_LEVEL', { infer: true });

  return {
    pinoHttp: {
      level,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers.set-cookie',
          'req.body.password',
          'req.body.currentPassword',
          'req.body.newPassword',
          'req.body.token',
          'req.body.refreshToken',
        ],
        censor: '[REDACTED]',
      },
      genReqId(request, response) {
        const requestId = resolveRequestId(request.headers['x-request-id']);

        request.headers['x-request-id'] = requestId;
        response.setHeader('x-request-id', requestId);
        return requestId;
      },
      customAttributeKeys: {
        responseTime: 'durationMs',
      },
      customLogLevel(_request, response, error) {
        if (response.statusCode >= 500 || error !== undefined) {
          return 'error';
        }

        if (response.statusCode >= 400) {
          return 'warn';
        }

        return 'info';
      },
      ...(environment === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: true,
                translateTime: 'SYS:standard',
              },
            },
          }
        : {}),
    },
  };
}
