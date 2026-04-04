import { OpportunityStatus } from './opportunity.entity';
import { OpportunityStateMachine } from './opportunity-state-machine';

describe('OpportunityStateMachine', () => {
  const stateMachine = new OpportunityStateMachine();

  it('allows forward status progression', () => {
    expect(
      stateMachine.canTransition(OpportunityStatus.SAVED, OpportunityStatus.APPLIED),
    ).toBe(true);
    expect(
      stateMachine.canTransition(
        OpportunityStatus.APPLIED,
        OpportunityStatus.RECRUITER_SCREEN,
      ),
    ).toBe(true);
  });

  it('allows active statuses to transition to rejected/withdrawn', () => {
    expect(
      stateMachine.canTransition(OpportunityStatus.LOOP, OpportunityStatus.REJECTED),
    ).toBe(true);
    expect(
      stateMachine.canTransition(
        OpportunityStatus.HIRING_MANAGER,
        OpportunityStatus.WITHDRAWN,
      ),
    ).toBe(true);
  });

  it('blocks backward transitions without manual reset', () => {
    expect(
      stateMachine.canTransition(OpportunityStatus.APPLIED, OpportunityStatus.SAVED),
    ).toBe(false);
    expect(() =>
      stateMachine.assertTransition(
        OpportunityStatus.APPLIED,
        OpportunityStatus.SAVED,
      ),
    ).toThrow('Invalid status transition');
  });

  it('allows manual reset transitions', () => {
    expect(
      stateMachine.canTransition(
        OpportunityStatus.APPLIED,
        OpportunityStatus.SAVED,
        { manualReset: true },
      ),
    ).toBe(true);
  });

  it('allows dormant transition only as a system transition', () => {
    expect(
      stateMachine.canTransition(OpportunityStatus.SAVED, OpportunityStatus.DORMANT),
    ).toBe(false);
    expect(
      stateMachine.canTransition(OpportunityStatus.SAVED, OpportunityStatus.DORMANT, {
        systemDormantTransition: true,
      }),
    ).toBe(true);
  });
});

