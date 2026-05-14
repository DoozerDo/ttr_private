import { decideGenerationEligibility } from './generation-eligibility';

describe('decideGenerationEligibility', () => {
  const baseline: any = { id: 'baseline-1' };
  const baselineVersion: any = { id: 'baseline-version-1' };
  const job: any = { id: 'job-1', title: 'Support Lead', company: 'Acme', rawDescription: 'Role' };
  const assessmentHigh: any = { overallScore: 92 };
  const assessmentLow: any = { overallScore: 72 };

  const evidenceWithWorkHistory: any = {
    usableWorkHistoryEvidence: true,
    warnings: [{ code: 'resume_v2_missing', message: 'missing' }],
    resumePlainText: 'Acme Support Lead Led support ops',
    workHistory: [{ company: 'Acme', roleTitle: 'Support Lead', bullets: ['Led support ops'] }],
  };

  it('is eligible with high readiness + high compatibility even if Resume V2 is missing when fallback work history exists', () => {
    const decision = decideGenerationEligibility({
      baseline,
      baselineVersion,
      job,
      readinessScore: 90,
      assessment: assessmentHigh,
      complianceBlocked: false,
      evidence: evidenceWithWorkHistory,
      targetRequirements: ['Python', 'Snowflake'],
      warningCodes: ['baseline_template_not_ready'],
    });
    expect(decision.eligible).toBe(true);
    expect(decision.hardBlocker).toBeNull();
    expect(decision.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(['baseline_template_not_ready', 'resume_v2_missing', 'unsupported_target_requirements']),
    );
    expect(decision.omittedUnsupportedRequirements).toEqual(expect.arrayContaining(['Python', 'Snowflake']));
  });

  it('hard blocks when score is below 80', () => {
    const decision = decideGenerationEligibility({
      baseline,
      baselineVersion,
      job,
      readinessScore: 90,
      assessment: assessmentLow,
      complianceBlocked: false,
      evidence: evidenceWithWorkHistory,
    });
    expect(decision.eligible).toBe(false);
    expect(decision.hardBlocker?.code).toBe('compatibility_below_threshold');
  });

  it('hard blocks when no usable work history evidence exists', () => {
    const decision = decideGenerationEligibility({
      baseline,
      baselineVersion,
      job,
      readinessScore: 90,
      assessment: assessmentHigh,
      complianceBlocked: false,
      evidence: { usableWorkHistoryEvidence: false, warnings: [], resumePlainText: '', workHistory: [] } as any,
    });
    expect(decision.eligible).toBe(false);
    expect(decision.hardBlocker?.code).toBe('no_verified_work_history_evidence');
  });

  it('hard blocks on compliance', () => {
    const decision = decideGenerationEligibility({
      baseline,
      baselineVersion,
      job,
      readinessScore: 90,
      assessment: assessmentHigh,
      complianceBlocked: true,
      evidence: evidenceWithWorkHistory,
    });
    expect(decision.eligible).toBe(false);
    expect(decision.hardBlocker?.code).toBe('hard_compliance_blocker');
  });
});

