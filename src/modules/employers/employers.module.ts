import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AdminEmployersController } from './admin-employers.controller.js';
import { EmployerAuthorizationPolicy } from './employer-authorization.policy.js';
import { EmployersController } from './employers.controller.js';
import { EmployersService } from './employers.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminEmployersController, EmployersController],
  providers: [EmployersService, EmployerAuthorizationPolicy],
  exports: [EmployerAuthorizationPolicy],
})
export class EmployersModule {}
