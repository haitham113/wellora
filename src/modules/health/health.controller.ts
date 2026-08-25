import { Controller, Get } from '@nestjs/common';

import { Public } from '../../common/auth/public.decorator.js';
import { HealthService, type LivenessResponse, type ReadinessResponse } from './health.service.js';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getLiveness(): LivenessResponse {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  getReadiness(): Promise<ReadinessResponse> {
    return this.healthService.getReadiness();
  }
}
