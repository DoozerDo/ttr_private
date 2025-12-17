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

    expect(sections).toHaveLength(2);
    expect(sections[0].sectionType).toBe(BaselineSectionType.OTHER);
    expect(sections[1].sectionType).toBe(BaselineSectionType.OTHER);
  });
});
