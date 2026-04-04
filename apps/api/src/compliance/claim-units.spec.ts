import { extractClaimUnitsFromSections, isValidClaim } from './claim-units';
import { GeneratedTextSourceType, type ComplianceTextSection } from './compliance.types';
import { ResumeLineType } from './resume-line-classifier';

describe('extractClaimUnitsFromSections', () => {
  it('filters malformed baseline fragments and keeps complete claims', () => {
    const sections: ComplianceTextSection[] = [
      {
        title: 'Experience',
        sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        sentenceSources: [
          {
            text: 'Senior Lead IT Engineer on the',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
          {
            text: 'Served as Senior Lead IT Engineer on the Cloud Support Engineering team.',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
        ],
      },
    ];

    const units = extractClaimUnitsFromSections(sections, {
      baselineOnly: true,
      enforceIntegrityForBaseline: true,
    });

    expect(units.map((unit) => unit.text)).not.toContain(
      'Senior Lead IT Engineer on the',
    );
    expect(units.map((unit) => unit.text)).toContain(
      'Served as Senior Lead IT Engineer on the Cloud Support Engineering team.',
    );
  });

  it('keeps standalone role titles that are semantically complete', () => {
    const sections: ComplianceTextSection[] = [
      {
        title: 'Experience',
        sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        sentenceSources: [
          {
            text: 'Software Development Engineer in Test',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
        ],
      },
    ];

    const units = extractClaimUnitsFromSections(sections, {
      baselineOnly: true,
      enforceIntegrityForBaseline: true,
    });

    expect(units.map((unit) => unit.text)).toContain(
      'Software Development Engineer in Test',
    );
    expect(units[0]?.lineType).toBe(ResumeLineType.ROLE_HEADER);
    expect(units[0]?.claim).toEqual({
      text: 'Software Development Engineer in Test',
      type: 'derived',
    });
  });

  it('preserves fragment-style baseline evidence only when explicitly enabled', () => {
    const sections: ComplianceTextSection[] = [
      {
        title: 'Experience',
        sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        sentenceSources: [
          {
            text: 'mobile lab infrastructure management',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
          {
            text: 'cloud platform automation engineering',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
        ],
      },
    ];

    const strictUnits = extractClaimUnitsFromSections(sections, {
      baselineOnly: true,
      enforceIntegrityForBaseline: true,
      includeBaselineEvidenceFragments: false,
    });
    expect(strictUnits).toHaveLength(0);

    const evidenceUnits = extractClaimUnitsFromSections(sections, {
      baselineOnly: true,
      enforceIntegrityForBaseline: true,
      includeBaselineEvidenceFragments: true,
    });
    expect(evidenceUnits.map((unit) => unit.text)).toEqual(
      expect.arrayContaining([
        'mobile lab infrastructure management',
        'cloud platform automation engineering',
      ]),
    );
    expect(
      evidenceUnits.every(
        (unit) => unit.lineType === ResumeLineType.BULLET_EVIDENCE_FRAGMENT,
      ),
    ).toBe(true);
  });

  it('drops skill stacks and noise from compliance claim units by default', () => {
    const sections: ComplianceTextSection[] = [
      {
        title: 'Experience',
        sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        sentenceSources: [
          {
            text: 'Professional Experience',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
          {
            text: 'Azure | Terraform | Kubernetes',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
          {
            text: 'Led migration of the automation platform.',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
        ],
      },
    ];

    const defaultUnits = extractClaimUnitsFromSections(sections, {
      baselineOnly: true,
      enforceIntegrityForBaseline: true,
    });
    expect(defaultUnits.map((unit) => unit.text)).toEqual([
      'Led migration of the automation platform.',
    ]);
    expect(defaultUnits[0]?.lineType).toBe(ResumeLineType.BULLET_CLAIM);

    const withSkillStacks = extractClaimUnitsFromSections(sections, {
      baselineOnly: true,
      enforceIntegrityForBaseline: true,
      includeSkillStacks: true,
    });
    expect(withSkillStacks.map((unit) => unit.text)).toContain(
      'Azure | Terraform | Kubernetes',
    );
    expect(
      withSkillStacks.find(
        (unit) => unit.text === 'Azure | Terraform | Kubernetes',
      )?.lineType,
    ).toBe(ResumeLineType.SKILL_STACK);
  });

  it('filters non-verifiable descriptor claims and retains real technology claims', () => {
    expect(isValidClaim('billing-impacting')).toBe(false);
    expect(isValidClaim('client-impacting')).toBe(false);
    expect(isValidClaim('cross-team')).toBe(false);
    expect(isValidClaim('first-response')).toBe(false);
    expect(isValidClaim('high-volume')).toBe(false);
    expect(isValidClaim('customer-facing')).toBe(false);
    expect(isValidClaim('Five9')).toBe(true);
  });

  it('does not emit descriptor-only claims into extracted units', () => {
    const sections: ComplianceTextSection[] = [
      {
        title: 'Experience',
        sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        sentenceSources: [
          { text: 'billing-impacting', sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE },
          { text: 'client-impacting', sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE },
          { text: 'cross-team', sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE },
          { text: 'first-response', sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE },
          { text: 'high-volume', sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE },
          { text: 'Implemented Five9 queue workflows.', sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE },
        ],
      },
    ];

    const units = extractClaimUnitsFromSections(sections, {
      baselineOnly: true,
      enforceIntegrityForBaseline: false,
      includeBaselineEvidenceFragments: true,
    });

    expect(units.map((unit) => unit.text)).toEqual(
      expect.arrayContaining([
        'Implemented Five9 queue workflows.',
      ]),
    );
    expect(units.map((unit) => unit.text)).not.toEqual(
      expect.arrayContaining([
        'billing-impacting',
        'client-impacting',
        'cross-team',
        'first-response',
        'high-volume',
      ]),
    );
  });
});
