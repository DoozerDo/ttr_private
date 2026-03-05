import { Injectable } from '@nestjs/common';
import { Opportunity, OpportunityFitBand, OpportunityStatus } from './opportunity.entity';
import { daysSince } from './opportunity-fit';

export type OpportunityActionCardType =
  | 'viable_crossing'
  | 'band_upgrade'
  | 'follow_up'
  | 'dormant_warning'
  | 'dormant';

export type OpportunityActionCard = {
  type: OpportunityActionCardType;
  priority: number;
  opportunityId: string;
  companyName: string;
  jobTitle: string;
  message: string;
};

const PRIORITY_ORDER: Record<OpportunityActionCardType, number> = {
  viable_crossing: 1,
  band_upgrade: 2,
  follow_up: 3,
  dormant_warning: 4,
  dormant: 5,
};

const TERMINAL_STATUSES = new Set<OpportunityStatus>([
  OpportunityStatus.REJECTED,
  OpportunityStatus.WITHDRAWN,
]);

const BAND_RANK: Record<OpportunityFitBand, number> = {
  [OpportunityFitBand.FIT_REVIEW]: 0,
  [OpportunityFitBand.VIABLE]: 1,
  [OpportunityFitBand.STRONG]: 2,
  [OpportunityFitBand.ELITE]: 3,
};

@Injectable()
export class OpportunityActionsNeededService {
  generateActionCards(opportunities: Opportunity[], now = new Date()) {
    const cards: OpportunityActionCard[] = [];

    for (const opportunity of opportunities) {
      const ageDays = daysSince(opportunity.lastStatusChange, now);
      const viableCrossing =
        opportunity.initialScore < 70 && opportunity.currentScore >= 70;
      const bandUpgrade =
        BAND_RANK[opportunity.currentBand] > BAND_RANK[opportunity.initialBand];
      const followUpRecommended =
        opportunity.status === OpportunityStatus.APPLIED && ageDays >= 6;
      const dormantWarning =
        !opportunity.dormant &&
        !TERMINAL_STATUSES.has(opportunity.status) &&
        opportunity.status !== OpportunityStatus.DORMANT &&
        ageDays >= 60 &&
        ageDays < 90;
      const dormantActive =
        opportunity.status === OpportunityStatus.DORMANT ||
        (opportunity.dormant && !TERMINAL_STATUSES.has(opportunity.status));

      if (viableCrossing) {
        cards.push(
          this.toCard(opportunity, 'viable_crossing', 'Opportunity became viable'),
        );
      }
      if (bandUpgrade) {
        cards.push(this.toCard(opportunity, 'band_upgrade', 'Fit band upgraded'));
      }
      if (followUpRecommended) {
        cards.push(this.toCard(opportunity, 'follow_up', 'Follow-up recommended'));
      }
      if (dormantWarning) {
        cards.push(
          this.toCard(opportunity, 'dormant_warning', 'Opportunity nearing dormant threshold'),
        );
      }
      if (dormantActive) {
        cards.push(
          this.toCard(opportunity, 'dormant', 'Opportunity marked dormant'),
        );
      }
    }

    return cards
      .sort((left, right) => {
        if (left.priority !== right.priority) return left.priority - right.priority;
        return left.companyName.localeCompare(right.companyName);
      })
      .slice(0, 5);
  }

  private toCard(
    opportunity: Opportunity,
    type: OpportunityActionCardType,
    message: string,
  ): OpportunityActionCard {
    return {
      type,
      priority: PRIORITY_ORDER[type],
      opportunityId: opportunity.id,
      companyName: opportunity.companyName,
      jobTitle: opportunity.jobTitle,
      message,
    };
  }
}

