import { Module } from '@nestjs/common';

import { CommissionSnapshotStrategy } from './commission-snapshot.strategy.js';

@Module({
  providers: [CommissionSnapshotStrategy],
  exports: [CommissionSnapshotStrategy],
})
export class CommissionsModule {}
