import { DALEN_MESSY_RESUME_FIXTURE } from './__fixtures__/dalen-messy-resume.fixture';
import type { EvidenceItem, MissingElement } from './evidence-model';
import { interpretEvidenceFromResumeText } from './evidence-interpreter';

// Phase 2: test-first contract for the evidence interpretation layer described in
// `docs/manual_target_this_role_workflow_blueprint.md`. Production logic is intentionally not implemented yet.

describe('evidence interpreter (blueprint contract)', () => {
  it('converts a messy but valid technical statement into partial usable evidence (tools present, no invented metrics)', () => {
    const result = interpretEvidenceFromResumeText({
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      resumeText: DALEN_MESSY_RESUME_FIXTURE.resumeText,
    });

    const item = findByText(result.items, DALEN_MESSY_RESUME_FIXTURE.examples.technicalNoMetrics);
    expect(item.evidenceStrength).toBe('partial');
    expect(item.evidenceSource).toBe('inferred_from_resume_text');
    expect(item.supportLevel).toBe('partial');
    expect(item.generationUse).toBe('use_with_constraints');
    expect(item.extracted?.tools).toEqual(expect.arrayContaining(['Node.js', 'PostgreSQL', 'AWS']));
    // No invented metrics.
    expect(item.extracted?.metrics ?? []).toEqual([]);
    expectMissing(item, 'metrics');
  });

  it('classifies a metric-backed statement as strong evidence and captures the explicit metric (no invented numbers)', () => {
    const result = interpretEvidenceFromResumeText({
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      resumeText: DALEN_MESSY_RESUME_FIXTURE.resumeText,
    });

    const item = findByText(result.items, DALEN_MESSY_RESUME_FIXTURE.examples.explicitMetricImpact);
    expect(item.evidenceStrength).toBe('strong');
    expect(item.supportLevel).toBe('direct');
    expect(item.generationUse).toBe('use_directly');
    expect(item.extracted?.metrics).toEqual(expect.arrayContaining(['35%', 'p95']));
    // Tools are not inferred from generic nouns like "queries" or "caching".
    expect(item.extracted?.tools ?? []).toEqual([]);
  });

  it('classifies a vague responsibility statement as weak and sets generationUse=positioning_only', () => {
    const result = interpretEvidenceFromResumeText({
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      resumeText: DALEN_MESSY_RESUME_FIXTURE.resumeText,
    });

    const item = findByText(result.items, DALEN_MESSY_RESUME_FIXTURE.examples.vagueResponsibility);
    expect(['weak', 'unusable']).toContain(item.evidenceStrength);
    if (item.evidenceStrength === 'weak') {
      expect(item.supportLevel).toBe('contextual');
      expect(item.generationUse).toBe('positioning_only');
    } else {
      expect(item.supportLevel).toBe('none');
      expect(item.generationUse).toBe('do_not_use');
    }
  });

  it('classifies empty/generic filler as unusable and sets generationUse=do_not_use', () => {
    const result = interpretEvidenceFromResumeText({
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      resumeText: `${DALEN_MESSY_RESUME_FIXTURE.resumeText}\nN/A`,
    });
    const item = findByText(result.items, 'N/A');
    expect(item.evidenceStrength).toBe('unusable');
    expect(item.supportLevel).toBe('none');
    expect(item.generationUse).toBe('do_not_use');
  });

  it('never invents metrics: missingElements includes metrics when none explicitly present', () => {
    const result = interpretEvidenceFromResumeText({
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      resumeText: DALEN_MESSY_RESUME_FIXTURE.resumeText,
    });
    const item = findByText(result.items, DALEN_MESSY_RESUME_FIXTURE.examples.contributionNoInflation);
    expect(item.extracted?.metrics ?? []).toEqual([]);
    expectMissing(item, 'metrics');
  });

  it('never inflates scope: does not infer "global", "enterprise-wide", team size, or ownership', () => {
    const result = interpretEvidenceFromResumeText({
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      resumeText: DALEN_MESSY_RESUME_FIXTURE.resumeText,
    });
    const item = findByText(result.items, DALEN_MESSY_RESUME_FIXTURE.examples.contributionNoInflation);
    const serialized = JSON.stringify(item);
    expect(serialized.toLowerCase()).not.toContain('global');
    expect(serialized.toLowerCase()).not.toContain('enterprise');
    expect(serialized.toLowerCase()).not.toMatch(/\b\d+\s*(?:people|engineers|reports)\b/i);
    expect(serialized.toLowerCase()).not.toContain('owned global');
  });

  it('captures tools only when explicitly present in the text or skills list (no inferred tools)', () => {
    const result = interpretEvidenceFromResumeText({
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      resumeText: DALEN_MESSY_RESUME_FIXTURE.resumeText,
    });
    const item = findByText(result.items, DALEN_MESSY_RESUME_FIXTURE.examples.shouldNotInfer);
    // React is explicit in the sentence; do not add unrelated tools like Kubernetes.
    expect(item.extracted?.tools).toEqual(expect.arrayContaining(['React']));
    expect(JSON.stringify(item).toLowerCase()).not.toContain('kubernetes');
  });

  it('records missingElements instead of fabricating missing outcome/scope/timeframe', () => {
    const result = interpretEvidenceFromResumeText({
      baselineId: 'baseline-1',
      baselineVersionId: 'baseline-version-1',
      resumeText: DALEN_MESSY_RESUME_FIXTURE.resumeText,
    });
    const item = findByText(result.items, DALEN_MESSY_RESUME_FIXTURE.examples.technicalNoMetrics);
    // Outcome/scope/timeframe are not present in the sentence; they should be marked missing, not fabricated.
    expectMissing(item, 'outcome');
    expectMissing(item, 'timeframe');
    expect(item.extracted?.scope).toBeNull();
    expect(item.extracted?.timeframe).toBeNull();
  });

  // Helper expectations for Phase 3 implementation (kept local to avoid coupling production code prematurely).
  function expectMissing(item: EvidenceItem, missing: MissingElement) {
    expect(item.missingElements).toEqual(expect.arrayContaining([missing]));
  }

  function findByText(items: EvidenceItem[], text: string): EvidenceItem {
    const found = items.find((item) => item.text === text);
    if (!found) {
      throw new Error(`Expected evidence item not found: "${text}"`);
    }
    return found;
  }
});
