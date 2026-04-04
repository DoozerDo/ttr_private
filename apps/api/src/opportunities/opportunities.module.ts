import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Opportunity } from './opportunity.entity';
import { OpportunityActionsNeededService } from './opportunity-actions-needed.service';
import { OpportunityRescoreHandler } from './opportunity-rescore.handler';
import { OpportunityStateMachine } from './opportunity-state-machine';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';

@Module({
  imports: [TypeOrmModule.forFeature([Opportunity])],
  providers: [
    OpportunityStateMachine,
    OpportunityActionsNeededService,
    OpportunityRescoreHandler,
    OpportunitiesService,
  ],
  controllers: [OpportunitiesController],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}

