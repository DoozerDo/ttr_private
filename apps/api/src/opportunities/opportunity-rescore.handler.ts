import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Opportunity } from './opportunity.entity';
import { fitBandFromScore } from './opportunity-fit';

const BAND_BOUNDARIES = [70, 80, 90] as const;

function isWithinBoundaryWindow(score: number, windowSize = 5) {
  return BAND_BOUNDARIES.some((boundary) => Math.abs(score - boundary) <= windowSize);
}

@Injectable()
export class OpportunityRescoreHandler {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
  ) {}

  async rescoreNearBoundaries(
    userId: string,
    resolveScore: (opportunity: Opportunity) => Promise<number | null>,
    baselineVersionUsed?: string | null,
  ) {
    const opportunities = await this.opportunityRepository.find({
      where: { userId },
    });

    const candidates = opportunities.filter((opportunity) =>
      isWithinBoundaryWindow(opportunity.currentScore),
    );

    let checkedCount = 0;
    let updatedCount = 0;

    for (const opportunity of candidates) {
      checkedCount += 1;
      const nextScore = await resolveScore(opportunity);
      if (nextScore === null || Number.isNaN(nextScore)) {
        continue;
      }

      const nextBand = fitBandFromScore(nextScore);
      if (nextBand !== opportunity.currentBand) {
        opportunity.currentScore = Math.round(nextScore);
        opportunity.currentBand = nextBand;
        opportunity.baselineVersionUsed =
          baselineVersionUsed ?? opportunity.baselineVersionUsed;
        await this.opportunityRepository.save(opportunity);
        updatedCount += 1;
      }
    }

    return {
      total: opportunities.length,
      precheckCandidates: candidates.length,
      checkedCount,
      updatedCount,
    };
  }

  async rescoreNearBoundariesFromOverride(
    userId: string,
    scoreByOpportunityId: Record<string, number>,
    baselineVersionUsed?: string | null,
  ) {
    return this.rescoreNearBoundaries(
      userId,
      async (opportunity) => scoreByOpportunityId[opportunity.id] ?? null,
      baselineVersionUsed,
    );
  }
}

