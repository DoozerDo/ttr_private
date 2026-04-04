import { BadRequestException } from '@nestjs/common';
import { OpportunityStatus } from './opportunity.entity';

type TransitionOptions = {
  manualReset?: boolean;
  systemDormantTransition?: boolean;
};

const TERMINAL_STATUSES = new Set<OpportunityStatus>([
  OpportunityStatus.REJECTED,
  OpportunityStatus.WITHDRAWN,
]);

const FORWARD_TRANSITIONS: Readonly<Record<OpportunityStatus, OpportunityStatus[]>> = {
  [OpportunityStatus.SAVED]: [OpportunityStatus.APPLIED],
  [OpportunityStatus.APPLIED]: [OpportunityStatus.RECRUITER_SCREEN],
  [OpportunityStatus.RECRUITER_SCREEN]: [OpportunityStatus.HIRING_MANAGER],
  [OpportunityStatus.HIRING_MANAGER]: [OpportunityStatus.LOOP],
  [OpportunityStatus.LOOP]: [OpportunityStatus.OFFER],
  [OpportunityStatus.OFFER]: [],
  [OpportunityStatus.REJECTED]: [],
  [OpportunityStatus.WITHDRAWN]: [],
  [OpportunityStatus.IN_FIT_REVIEW]: [],
  [OpportunityStatus.DORMANT]: [],
};

export class OpportunityStateMachine {
  canTransition(
    current: OpportunityStatus,
    next: OpportunityStatus,
    options?: TransitionOptions,
  ) {
    if (current === next) {
      return true;
    }

    if (options?.manualReset) {
      return true;
    }

    if (next === OpportunityStatus.DORMANT) {
      return (
        options?.systemDormantTransition === true &&
        !TERMINAL_STATUSES.has(current)
      );
    }

    if (next === OpportunityStatus.REJECTED || next === OpportunityStatus.WITHDRAWN) {
      return !TERMINAL_STATUSES.has(current);
    }

    return (FORWARD_TRANSITIONS[current] ?? []).includes(next);
  }

  assertTransition(
    current: OpportunityStatus,
    next: OpportunityStatus,
    options?: TransitionOptions,
  ) {
    if (this.canTransition(current, next, options)) {
      return;
    }

    throw new BadRequestException(
      `Invalid status transition from ${current} to ${next}`,
    );
  }
}

