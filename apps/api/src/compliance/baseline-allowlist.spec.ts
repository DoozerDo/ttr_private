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
});
