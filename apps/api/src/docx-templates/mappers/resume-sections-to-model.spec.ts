import { BaselineSectionType } from '../../baseline/baseline-section.entity';
import { mapResumeSectionsToDocxModel } from './resume-sections-to-model';

describe('mapResumeSectionsToDocxModel experience splitting', () => {
  it('splits multiple jobs in one EXPERIENCE section into separate entries', () => {
    const model = mapResumeSectionsToDocxModel([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Professional Experience',
        content: `Senior I/O Engineer (Sr. DevOps Engineer)
Genoa Healthcare, August 2019 – March 2025
• Built CI/CD pipelines.

Senior Lead IT Engineer
CenturyLink Cloud, July 2015 - August 2019
• Led enterprise cloud support.

Windows Systems Administrator
FriendFinder, April 2013 - July 2015
• Maintained production systems.`,
      },
    ]);

    const expSection = model.sections.find((section) => section.key === 'experience');
    expect(expSection).toBeDefined();
    expect(expSection?.items).toHaveLength(3);
  });

  it('uses second line company/date to enrich a role-only header', () => {
    const model = mapResumeSectionsToDocxModel([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Professional Experience',
        content: `Senior I/O Engineer (Sr. DevOps Engineer)
Genoa Healthcare, August 2019 – March 2025
• Built CI/CD pipelines.`,
      },
    ]);

    const expSection = model.sections.find((section) => section.key === 'experience');
    const first = expSection?.items[0] as { company?: string; dateRange?: string } | undefined;

    expect(first?.company).toBe('Genoa Healthcare');
    expect(first?.dateRange).toContain('2019');
  });
});
