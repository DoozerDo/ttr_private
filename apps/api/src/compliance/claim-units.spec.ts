import { extractClaimUnitsFromSections } from './claim-units';
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
});
