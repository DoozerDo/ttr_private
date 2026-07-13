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
        allowedRoles: [],
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

  it('does not treat contact header data as technology assertions', () => {
    const flags = detectFictionalTechnology({
      generatedSections: [
        {
          title: 'Alex Candidate | alex@example.com | linkedin.com/in/alex-candidate',
          content: 'Support operations leader with incident response ownership.',
          sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        },
      ],
      baselineSections: [],
      baselineAllowlist: {
        allowedCompanies: [],
        allowedRoles: [],
        allowedTechnologies: [],
        allowedMetricTokens: [],
      },
    });

    expect(
      flags.some((flag) => flag.code === ComplianceFlagCode.FICTIONAL_TECHNOLOGY),
    ).toBe(false);
  });

  it('does not flag synthetic support-ops infrastructure tokens when present in baseline allowlist', () => {
    const flags = detectFictionalTechnology({
      baselineSections: [
        {
          title: 'Baseline',
          content:
            'Zendesk | Jira | Salesforce Service Cloud | SQL | Looker | Linux | monitoring | VPN | DNS | DHCP | remote access',
          sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        },
      ],
      generatedSections: [
        {
          title: 'Generated',
          content:
            'Improved incident operations on Linux with monitoring, remote access, VPN, DNS, and DHCP troubleshooting.',
          sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        },
      ],
      baselineAllowlist: {
        allowedCompanies: [],
        allowedRoles: [],
        allowedTechnologies: [
          'Zendesk',
          'Jira',
          'Salesforce Service Cloud',
          'SQL',
          'Looker',
          'Linux',
          'monitoring',
          'VPN',
          'DNS',
          'DHCP',
          'remote access',
        ],
        allowedMetricTokens: [],
      },
    });

    const fictionalTechFlags = flags.filter(
      (flag) => flag.code === ComplianceFlagCode.FICTIONAL_TECHNOLOGY,
    );
    expect(fictionalTechFlags).toHaveLength(0);
  });
});
