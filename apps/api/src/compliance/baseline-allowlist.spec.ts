import { buildBaselineAllowlistSnapshot } from './baseline-allowlist';
import { GeneratedTextSourceType, type ComplianceTextSection } from './compliance.types';

describe('buildBaselineAllowlistSnapshot', () => {
  it('extracts technology allowlist entries from baseline evidence skill stacks', () => {
    const sections: ComplianceTextSection[] = [
      {
        title: 'Technical Skills',
        content: 'Zendesk | Jira | Salesforce Service Cloud | SQL | Looker',
        sectionType: 'SKILLS',
        sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
      },
    ];

    const allowlist = buildBaselineAllowlistSnapshot(sections);

    expect(allowlist.allowedTechnologies).toEqual(
      expect.arrayContaining(['zendesk', 'salesforce']),
    );
  });

  it('does not promote contact/header lines into technology allowlist entries', () => {
    const sections: ComplianceTextSection[] = [
      {
        title: 'Alex Candidate | alex@example.com | linkedin.com/in/alex-candidate',
        content: 'Support operations leader with incident response ownership.',
        sectionType: 'EXPERIENCE',
        sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
      },
    ];

    const allowlist = buildBaselineAllowlistSnapshot(sections);

    expect(allowlist.allowedTechnologies).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('example.com'),
        expect.stringContaining('linkedin.com'),
      ]),
    );
  });
});
