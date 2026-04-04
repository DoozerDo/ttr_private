import {
  detectFictionalTechnology,
} from './detectors';
import {
  ComplianceFlagCode,
  GeneratedTextSourceType,
} from './compliance.types';

describe('detectFictionalTechnology', () => {
  it('ignores obvious garbage technology tokens', () => {
    const flags = detectFictionalTechnology({
      baselineSections: [
        {
          title: 'Baseline',
          content: 'Managed service operations with documented tooling.',
          sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        },
      ],
      generatedSections: [
        {
          title: 'Generated',
          content:
            'Used 206-949-1418, 2022, 000, self-service, multi-system, and NetSuite for operations.',
          sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        },
      ],
      baselineAllowlist: {
        allowedCompanies: [],
        allowedRoleTitles: [],
        allowedTechnologies: [],
        allowedMetricTokens: [],
      },
    });

    const technologyClaims = flags
      .filter((flag) => flag.code === ComplianceFlagCode.FICTIONAL_TECHNOLOGY)
      .flatMap((flag) => flag.evidence ?? [])
      .map((entry) => entry.generatedClaim?.text ?? entry.generated)
      .map((value) => String(value ?? '').toLowerCase());

    expect(technologyClaims).not.toContain('206-949-1418');
    expect(technologyClaims).not.toContain('2022');
    expect(technologyClaims).not.toContain('000');
    expect(technologyClaims).not.toContain('self-service');
    expect(technologyClaims).not.toContain('multi-system');
  });
});
