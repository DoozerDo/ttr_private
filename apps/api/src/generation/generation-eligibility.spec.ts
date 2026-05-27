import { decideGenerationEligibility } from './generation-eligibility';
import { resolveWorkflowContract } from '@shared/workflowContract';

describe('generation-eligibility', () => {
  const baseline = { id: 'base-1' } as any;
  const baselineVersion = { id: 'basev-1' } as any;
  const job = { id: 'job-1' } as any;

  const usableEvidence = {
    usableWorkHistoryEvidence: true,
    warnings: [],
    resumePlainText: 'Experience Acme Corp',
    workHistory: [{ company: 'Acme', roleTitle: 'Ops', bullets: ['Did thing'] }],
  } as any;

  const unusableEvidence = {
    usableWorkHistoryEvidence: false,
    warnings: [],
    resumePlainText: '',
    workHistory: [],
  } as any;

  function eligibility(
    params: Partial<Parameters<typeof decideGenerationEligibility>[0]> = {},
  ) {
    return decideGenerationEligibility({
      baseline,
      baselineVersion,
      job,
      readinessScore: 80,
      assessment: { overallScore: 85 } as any,
      complianceBlocked: false,
      evidence: usableEvidence,
      targetRequirements: [],
      warningCodes: [],
      ...params,
    });
  }

  it('blocks when baseline is missing', () => {
    const decision = decideGenerationEligibility({
      baseline: null,
      baselineVersion,
      job,
      readinessScore: 80,
      assessment: { overallScore: 85 } as any,
      complianceBlocked: false,
      evidence: usableEvidence,
      targetRequirements: [],
      warningCodes: [],
    });
    expect(decision.eligible).toBe(false);
    expect(decision.hardBlocker?.code).toBe('missing_baseline');
  });

  it('blocks when baseline version is missing', () => {
    const decision = decideGenerationEligibility({
      baseline,
      baselineVersion: null,
      job,
      readinessScore: 80,
      assessment: { overallScore: 85 } as any,
      complianceBlocked: false,
      evidence: usableEvidence,
      targetRequirements: [],
      warningCodes: [],
    });
    expect(decision.eligible).toBe(false);
    expect(decision.hardBlocker?.code).toBe('missing_baseline_version');
  });

  it('blocks when job context is missing', () => {
    const decision = decideGenerationEligibility({
      baseline,
      baselineVersion,
      job: null,
      readinessScore: 80,
      assessment: { overallScore: 85 } as any,
      complianceBlocked: false,
      evidence: usableEvidence,
      targetRequirements: [],
      warningCodes: [],
    });
    expect(decision.eligible).toBe(false);
    expect(decision.hardBlocker?.code).toBe('missing_target_role');
  });

  it('allows generation when score>=80 and baseline usable', () => {
    const decision = eligibility({ assessment: { overallScore: 80 } as any });
    expect(decision.eligible).toBe(true);
    expect(decision.hardBlocker).toBeNull();

    const contract = resolveWorkflowContract({
      baselineUsable: true,
      score: 80,
      hasRenderableResumeArtifact: false,
      hasRenderableCoverLetterArtifact: false,
    });
    expect(contract.scoreAllowsGeneration).toBe(true);
    expect(contract.resumeGenerationAllowed).toBe(true);
    expect(contract.coverLetterGenerationAllowed).toBe(true);
    expect(contract.blockingReason).toBeNull();
  });

  it('blocks generation when score<80 (explicit compatibility block)', () => {
    const decision = eligibility({ assessment: { overallScore: 79 } as any });
    expect(decision.eligible).toBe(false);
    expect(decision.hardBlocker?.code).toBe('compatibility_below_threshold');

    const contract = resolveWorkflowContract({
      baselineUsable: true,
      score: 79,
      hasRenderableResumeArtifact: false,
      hasRenderableCoverLetterArtifact: false,
    });
    expect(contract.scoreAllowsGeneration).toBe(false);
    expect(contract.resumeGenerationAllowed).toBe(false);
    expect(contract.coverLetterGenerationAllowed).toBe(false);
    expect(contract.blockingReason).toBe('score_below_generation_threshold');
  });

  it('blocks generation when score is missing (explicit score missing block)', () => {
    const decision = eligibility({ assessment: { overallScore: null } as any });
    expect(decision.eligible).toBe(false);
    expect(decision.hardBlocker?.code).toBe('missing_compatibility_score');

    const contract = resolveWorkflowContract({
      baselineUsable: true,
      score: null,
      hasRenderableResumeArtifact: false,
      hasRenderableCoverLetterArtifact: false,
    });
    expect(contract.scoreAllowsGeneration).toBe(false);
    expect(contract.resumeGenerationAllowed).toBe(false);
    expect(contract.coverLetterGenerationAllowed).toBe(false);
    expect(contract.blockingReason).toBe('score_below_generation_threshold');
  });

  it('blocks generation when baseline is unusable (explicit baseline evidence block)', () => {
    const decision = eligibility({ evidence: unusableEvidence });
    expect(decision.eligible).toBe(false);
    expect(decision.hardBlocker?.code).toBe('no_verified_work_history_evidence');

    const contract = resolveWorkflowContract({
      baselineUsable: false,
      score: 85,
      hasRenderableResumeArtifact: false,
      hasRenderableCoverLetterArtifact: false,
    });
    expect(contract.scoreAllowsGeneration).toBe(true);
    expect(contract.resumeGenerationAllowed).toBe(false);
    expect(contract.coverLetterGenerationAllowed).toBe(false);
    expect(contract.blockingReason).toBe('baseline_unusable');
  });
});

