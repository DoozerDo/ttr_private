import { BaselineSectionType } from '../../baseline/baseline-section.entity';
import { mapResumeSectionsToDocxModel } from './resume-sections-to-model';

describe('mapResumeSectionsToDocxModel experience splitting', () => {
  it('keeps professional section hierarchy and preserves experience chronology', () => {
    const model = mapResumeSectionsToDocxModel([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: `Director of Support | NewCo | 2022 - Present
â€¢ Led enterprise support operations.
â€¢ Improved escalation handling.

Support Manager | PriorCo | 2018 - 2022
â€¢ Managed daily support workflows.
â€¢ Built KPI reporting rhythm.`,
      },
      {
        type: BaselineSectionType.SKILLS,
        title: 'Skills',
        content: 'Support Operations, Incident Response, KPI Reporting',
      },
      {
        type: BaselineSectionType.SUMMARY,
        title: 'Summary',
        content: 'Operations leader focused on support quality and delivery.',
      },
      {
        type: BaselineSectionType.EDUCATION,
        title: 'Education',
        content: 'B.S. Business | State University | 2014',
      },
    ]);

    expect(model.sections.map((section) => section.key)).toEqual([
      'summary',
      'skills',
      'experience',
      'education',
    ]);

    const experienceItems = model.sections.find(
      (section) => section.key === 'experience',
    )?.items as Array<{ role: string }> | undefined;
    expect(experienceItems?.[0]?.role).toContain('Director of Support');
    expect(experienceItems?.[1]?.role).toContain('Support Manager');
  });

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

  it('splits entries when each header already includes company and date on one line', () => {
    const model = mapResumeSectionsToDocxModel([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Professional Experience',
        content: `Senior I/O Engineer (Sr. DevOps Engineer) | Genoa Healthcare | August 2019 – March 2025
• Built CI/CD pipelines.

Senior Lead IT Engineer | CenturyLink Cloud | July 2015 - August 2019
• Led enterprise cloud support.

Windows Systems Administrator | FriendFinder | April 2013 - July 2015
• Maintained production systems.`,
      },
    ]);

    const expSection = model.sections.find((section) => section.key === 'experience');
    expect(expSection).toBeDefined();
    expect(expSection?.items).toHaveLength(3);
  });

  it('retains other section content even when one line includes contact info', () => {
    const model = mapResumeSectionsToDocxModel([
      {
        type: BaselineSectionType.OTHER,
        title: 'Other',
        content: `Doug Canny
IT Systems Engineer | DevOps | Automation
doug@example.com
IT professional with nearly 20 years of experience transitioning to cloud infrastructure.`,
      },
    ]);

    const otherSection = model.sections.find((section) => section.key === 'other');
    expect(otherSection).toBeDefined();
    const firstItem = otherSection?.items[0] as { lines?: string[] } | undefined;
    expect(firstItem?.lines?.join('\n')).toContain('nearly 20 years of experience');
  });

  it('keeps full summary text without truncating after a few sentences', () => {
    const longSummary = [
      'IT professional with nearly 20 years of experience, starting in IT support before transitioning to DevOps-focused automation and cloud infrastructure.',
      'Proven expertise in CI/CD pipelines, infrastructure as code, and PowerShell scripting.',
      'Adept at designing scalable automation solutions to enhance system performance and developer productivity.',
      'Strong background in cloud computing, system administration, and deployment automation across enterprise environments.',
    ].join(' ');

    const model = mapResumeSectionsToDocxModel([
      {
        type: BaselineSectionType.SUMMARY,
        title: 'Summary',
        content: longSummary,
      },
    ]);

    const summarySection = model.sections.find((section) => section.key === 'summary');
    const summary = summarySection?.items[0] as { paragraphs?: string[] } | undefined;

    expect(summarySection).toBeDefined();
    expect(summary?.paragraphs?.join(' ')).toContain('Strong background in cloud computing');
  });

  it('does not classify narrative lines with numbers as header contact lines', () => {
    const model = mapResumeSectionsToDocxModel([
      {
        type: BaselineSectionType.OTHER,
        title: 'Other',
        content: `Doug Canny
IT Systems Engineer | DevOps | Automation
IT professional with nearly 20 years of experience.
Proven expertise in CI/CD pipelines.`,
      },
    ]);

    expect(model.header.contactLines).toBeUndefined();
    const otherSection = model.sections.find((section) => section.key === 'other');
    const text = (otherSection?.items[0] as { lines?: string[] } | undefined)?.lines?.join(' ') ?? '';
    expect(text).toContain('nearly 20 years of experience');
  });

  it('maps intro-like OTHER content into summary when no summary exists', () => {
    const model = mapResumeSectionsToDocxModel([
      {
        type: BaselineSectionType.OTHER,
        title: 'Other',
        content: `Doug Canny
IT Systems Engineer | DevOps | Automation
IT professional with nearly 20 years of experience, starting in IT support before transitioning to DevOps-focused automation and cloud infrastructure.`,
      },
      {
        type: BaselineSectionType.SKILLS,
        title: 'Skills',
        content: 'PowerShell, Terraform, AWS',
      },
    ]);

    const summarySection = model.sections.find((section) => section.key === 'summary');
    const summary = summarySection?.items[0] as { paragraphs?: string[] } | undefined;
    expect(summarySection).toBeDefined();
    expect(summary?.paragraphs?.join(' ')).toContain('nearly 20 years of experience');

    const otherSection = model.sections.find((section) => section.key === 'other');
    expect(otherSection).toBeUndefined();
  });

  it('keeps draft-bullet sections even when content is empty', () => {
    const model = mapResumeSectionsToDocxModel([
      {
        type: BaselineSectionType.SUMMARY,
        title: 'Summary',
        content: '',
        bullets: [{ text: 'Leads operational support programs.' }],
      },
      {
        type: BaselineSectionType.SKILLS,
        title: 'Skills',
        content: '',
        bullets: [{ text: 'Incident Management' }, { text: 'SaaS Operations' }],
      },
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: '',
        bullets: [{ text: 'Reduced escalations by 30%.' }],
      },
      {
        type: BaselineSectionType.EDUCATION,
        title: 'Education',
        content: '',
        bullets: [{ text: 'B.S. Business | State U | 2015' }],
      },
    ]);

    expect(model.sections.find((section) => section.key === 'summary')).toBeDefined();
    expect(model.sections.find((section) => section.key === 'skills')).toBeDefined();
    expect(model.sections.find((section) => section.key === 'experience')).toBeDefined();
    expect(model.sections.find((section) => section.key === 'education')).toBeDefined();
  });

  it('suppresses summary section when summary content is malformed bullet list text', () => {
    const model = mapResumeSectionsToDocxModel([
      {
        type: BaselineSectionType.SUMMARY,
        title: 'Summary',
        content: `Summary
• Led support operations.
• Owned incident workflows.
• Improved reporting cadence.`,
      },
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content: `Support Manager | Acme | 2021 - 2024
• Led team operations.`,
      },
    ]);

    expect(model.sections.find((section) => section.key === 'summary')).toBeUndefined();
    expect(model.sections.find((section) => section.key === 'experience')).toBeDefined();
  });

  it('keeps role titles with commas intact and extracts company/date cleanly', () => {
    const model = mapResumeSectionsToDocxModel([
      {
        type: BaselineSectionType.EXPERIENCE,
        title: 'Professional Experience',
        content: `Director, Support Operations | Acme Corp, August 2019 - March 2025
• Led support operations and escalation governance.`,
      },
    ]);

    const expSection = model.sections.find((section) => section.key === 'experience');
    const first = expSection?.items[0] as
      | { role?: string; company?: string; dateRange?: string }
      | undefined;

    expect(first?.role).toBe('Director, Support Operations');
    expect(first?.company).toBe('Acme Corp');
    expect(first?.dateRange).toBe('August 2019 - March 2025');
  });
});
