import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AdminProvidersController } from './admin-providers.controller.js';
import { ProviderAuthorizationPolicy } from './provider-authorization.policy.js';
import { ProvidersController } from './providers.controller.js';
import { ProvidersService } from './providers.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminProvidersController, ProvidersController],
  providers: [ProvidersService, ProviderAuthorizationPolicy],
  exports: [ProviderAuthorizationPolicy],
})
export class ProvidersModule {}
