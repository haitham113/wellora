import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiServiceUnavailableResponse, ApiTooManyRequestsResponse } from '@nestjs/swagger';

import { ApiErrorResponseDto } from '../../common/exceptions/api-error-response.dto.js';

export const RATE_LIMIT_NAMESPACE_KEY = 'rateLimitNamespace';

export const SensitiveRateLimit = (namespace: string): MethodDecorator =>
  applyDecorators(
    SetMetadata(RATE_LIMIT_NAMESPACE_KEY, namespace),
    ApiTooManyRequestsResponse({ type: ApiErrorResponseDto, description: 'Rate limit exceeded' }),
    ApiServiceUnavailableResponse({
      type: ApiErrorResponseDto,
      description: 'Rate-limit enforcement is unavailable',
    }),
  );
