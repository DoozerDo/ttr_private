import { OpportunityFitBand, OpportunityStatus } from './opportunity.entity';

export function fitBandFromScore(score: number): OpportunityFitBand {
  if (score >= 90) return OpportunityFitBand.ELITE;
  if (score >= 80) return OpportunityFitBand.STRONG;
  if (score >= 70) return OpportunityFitBand.VIABLE;
  return OpportunityFitBand.FIT_REVIEW;
}

export function bandPriority(band: OpportunityFitBand): number {
  switch (band) {
    case OpportunityFitBand.ELITE:
      return 0;
    case OpportunityFitBand.STRONG:
      return 1;
    case OpportunityFitBand.VIABLE:
      return 2;
    case OpportunityFitBand.FIT_REVIEW:
    default:
      return 3;
  }
}

export function daysSince(date: Date, now = new Date()): number {
  const diffMs = now.getTime() - date.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

export function computeNextAction(
  status: OpportunityStatus,
  lastStatusChange: Date,
  now = new Date(),
): string {
  switch (status) {
    case OpportunityStatus.SAVED:
      return 'Generate Resume';
    case OpportunityStatus.APPLIED:
      return daysSince(lastStatusChange, now) >= 6
        ? 'Follow Up'
        : 'Await Response';
    case OpportunityStatus.RECRUITER_SCREEN:
      return 'Prepare Recruiter Interview';
    case OpportunityStatus.HIRING_MANAGER:
      return 'Prepare Hiring Manager Interview';
    case OpportunityStatus.LOOP:
      return 'Prepare Panel Interview';
    case OpportunityStatus.OFFER:
      return 'Review Offer';
    case OpportunityStatus.IN_FIT_REVIEW:
      return 'Improve Baseline';
    case OpportunityStatus.DORMANT:
      return 'Reactivate or Close';
    case OpportunityStatus.REJECTED:
    case OpportunityStatus.WITHDRAWN:
      return 'None';
    default:
      return 'None';
  }
}

