import { BaselineParserService } from './baseline-parser.service';
import { BaselineSectionType } from './baseline-section.entity';

describe('BaselineParserService', () => {
  let service: BaselineParserService;

  beforeEach(() => {
    service = new BaselineParserService();
  });

  it('parses known headings into ordered sections', () => {
    const rawText = `SUMMARY
A driven engineer

WORK EXPERIENCE
Company A - Developer

EDUCATION
Great University`;

    const sections = service.parseBaseline(rawText);

    expect(sections).toHaveLength(3);
    expect(sections[0]).toMatchObject({
      sectionType: BaselineSectionType.SUMMARY,
      order: 0,
    });
    expect(sections[1]).toMatchObject({
      sectionType: BaselineSectionType.EXPERIENCE,
      order: 1,
    });
    expect(sections[2]).toMatchObject({
      sectionType: BaselineSectionType.EDUCATION,
      order: 2,
    });
  });

  it('returns a single OTHER section when no headings are found', () => {
    const rawText = 'Just a simple resume without headings.';

    const sections = service.parseBaseline(rawText);

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      sectionType: BaselineSectionType.OTHER,
      order: 0,
    });
    expect(sections[0].content).toContain('simple resume');
  });

  it('maps unknown headings to OTHER', () => {
    const rawText = `Overview
Line one

Random Header
Line two`;

    const sections = service.parseBaseline(rawText);

    expect(sections).toHaveLength(1);
    expect(sections[0].sectionType).toBe(BaselineSectionType.OTHER);
  });

  it('does not classify pre-heading profile text as Technical Skills', () => {
    const rawText = `Doug Canny IT Systems Engineer | DevOps | Automation
IT professional with nearly 20 years of experience.

Technical Skills
PowerShell
Terraform

Professional Experience
Company A | Senior Engineer | 2019 - 2025`;

    const sections = service.parseBaseline(rawText);

    expect(sections[0]).toMatchObject({
      sectionType: BaselineSectionType.OTHER,
    });
    expect(sections[0].content).toContain('20 years of experience');

    expect(sections[1]).toMatchObject({
      sectionType: BaselineSectionType.SKILLS,
      title: 'Technical Skills',
    });
  });

  it('keeps merged role headers separated by company and role markers', () => {
    const rawText = `EXPERIENCE
Acme Corp | Engineer | Jan 2020 - Dec 2021
Built internal tooling

Acme Corp | Senior Engineer | Jan 2022 - Present
Led platform work`;

    const sections = service.parseBaseline(rawText);

    expect(sections).toHaveLength(1);
    expect(sections[0].content).toContain('Senior Engineer');
  });

  it('preserves wrapped bullets for downstream evidence splitting', () => {
    const rawText = `WORK EXPERIENCE
Acme Corp | Engineer | 2020 - 2021
- Delivered migration
  continued on next line
- Improved reliability`;

    const sections = service.parseBaseline(rawText);

    expect(sections[0].content).toContain('continued on next line');
  });

  it('keeps duplicate education tokens visible for cleanup', () => {
    const rawText = `EDUCATION
Degree | Degree
University of Example`;

    const sections = service.parseBaseline(rawText);

    expect(sections[0].content).toContain('Degree | Degree');
  });
});
