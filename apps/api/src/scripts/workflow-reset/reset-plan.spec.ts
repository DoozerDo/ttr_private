import { buildWorkflowResetPlan, KNOWN_TABLE_CLASSIFICATION } from './reset-plan';

describe('buildWorkflowResetPlan', () => {
  it('classifies known tables and flags unknowns for manual review', () => {
    const discovered = [
      ...KNOWN_TABLE_CLASSIFICATION.preserve,
      ...KNOWN_TABLE_CLASSIFICATION.clear,
      ...KNOWN_TABLE_CLASSIFICATION.manualReview,
      'some_new_table',
      'migrations',
      'typeorm_metadata',
    ];

    const plan = buildWorkflowResetPlan(discovered);

    expect(plan.clear.sort()).toEqual([...KNOWN_TABLE_CLASSIFICATION.clear].sort());
    expect(plan.preserve).toEqual(
      expect.arrayContaining([
        ...KNOWN_TABLE_CLASSIFICATION.preserve,
        ...KNOWN_TABLE_CLASSIFICATION.manualReview,
        'migrations',
        'typeorm_metadata',
      ]),
    );
    expect(plan.manualReview.sort()).toEqual([...KNOWN_TABLE_CLASSIFICATION.manualReview].sort());
    expect(plan.unknownDiscovered).toEqual(['some_new_table']);
  });

  it('never clears unknown discovered tables', () => {
    const plan = buildWorkflowResetPlan(['users', 'migrations', 'unknown1', 'unknown2']);
    expect(plan.clear).toEqual([]);
    expect(plan.unknownDiscovered.sort()).toEqual(['unknown1', 'unknown2']);
  });
});

