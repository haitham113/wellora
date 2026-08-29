import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { EmployersModule } from '../employers/employers.module.js';
import { AllowanceBalanceStrategy } from './allowance-balance.strategy.js';
import { AllowanceLedgerService } from './allowance-ledger.service.js';
import { AllowanceQueriesService } from './allowance-queries.service.js';
import { EmployerAllowancesController } from './employer-allowances.controller.js';
import { EmployerAllowancesService } from './employer-allowances.service.js';
import { SelfAllowancesController } from './self-allowances.controller.js';

@Module({
  imports: [DatabaseModule, EmployersModule],
  controllers: [EmployerAllowancesController, SelfAllowancesController],
  providers: [
    AllowanceBalanceStrategy,
    AllowanceLedgerService,
    AllowanceQueriesService,
    EmployerAllowancesService,
  ],
  exports: [AllowanceLedgerService],
})
export class AllowancesModule {}
