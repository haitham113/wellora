import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { AvailabilityController } from './availability.controller.js';
import { AvailabilityService } from './availability.service.js';
import {
  ProviderActivitySessionsController,
  ProviderSessionsController,
} from './provider-sessions.controller.js';
import { ProviderSessionsService } from './provider-sessions.service.js';
import { ProviderSchedulesController } from './provider-schedules.controller.js';
import { RecurringSchedulesService } from './recurring-schedules.service.js';
import { SessionLifecyclePolicy } from './session-lifecycle.policy.js';
import { TimezoneService } from './timezone.service.js';

@Module({
  imports: [DatabaseModule, ProvidersModule],
  controllers: [
    AvailabilityController,
    ProviderActivitySessionsController,
    ProviderSessionsController,
    ProviderSchedulesController,
  ],
  providers: [
    AvailabilityService,
    ProviderSessionsService,
    RecurringSchedulesService,
    SessionLifecyclePolicy,
    TimezoneService,
  ],
  exports: [AvailabilityService, ProviderSessionsService, RecurringSchedulesService],
})
export class SchedulingModule {}
