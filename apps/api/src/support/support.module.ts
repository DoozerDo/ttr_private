import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CriticalFlowTrackerService } from './critical-flow-tracker.service';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  imports: [ConfigModule],
  controllers: [SupportController],
  providers: [SupportService, CriticalFlowTrackerService],
  exports: [SupportService, CriticalFlowTrackerService],
})
export class SupportModule {}
