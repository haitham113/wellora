import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { AdminEmployersController } from './admin-employers.controller.js';
import { EmployerAuthorizationPolicy } from './employer-authorization.policy.js';
import { EmployerAdminsService } from './employer-admins.service.js';
import { EmployeesService } from './employees.service.js';
import { EmployersController } from './employers.controller.js';
import { EmployersService } from './employers.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminEmployersController, EmployersController],
  providers: [
    EmployersService,
    EmployerAdminsService,
    EmployeesService,
    EmployerAuthorizationPolicy,
  ],
  exports: [EmployerAuthorizationPolicy],
})
export class EmployersModule {}
