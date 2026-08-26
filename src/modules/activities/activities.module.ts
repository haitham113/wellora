import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { ActivitiesController } from './activities.controller.js';
import { ActivityLifecyclePolicy } from './activity-lifecycle.policy.js';
import { ProviderActivitiesController } from './provider-activities.controller.js';
import { ProviderActivitiesService } from './provider-activities.service.js';
import { PublicActivitiesService } from './public-activities.service.js';

@Module({
  imports: [DatabaseModule, ProvidersModule],
  controllers: [ActivitiesController, ProviderActivitiesController],
  providers: [ActivityLifecyclePolicy, ProviderActivitiesService, PublicActivitiesService],
})
export class ActivitiesModule {}
