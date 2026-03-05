import { BaselineIncludePolicy, BaselineSectionType } from '../baseline/baseline-section.entity';
import {
  buildDraftBulletsForSection,
  buildResumeDraftSections,
  extractJobKeywords,
  splitSectionContentToBulletTexts,
} from './resume-draft-bullets';

describe('resume draft bullets', () => {
  it('splits baseline content into bullets using common markers', () => {
    const result = splitSectionContentToBulletTexts(
      [
        'Professional Experience',
        '- Led incident response across teams',
        '* Built tooling for onboarding',
        '1. Improved SLA performance',
      ].join('\n'),
    );

    expect(result.map((entry) => entry.text)).toEqual([
      'Led incident response across teams',
      'Built tooling for onboarding',
      'Improved SLA performance',
    ]);
  });

  it('ranks bullets by job keyword overlap when keywords are present', () => {
    const section = {
      id: 'section-1',
      sectionType: BaselineSectionType.EXPERIENCE,
      order: 2,
      content: [
        '- Led global support operations for SaaS customers',
        '- Improved onboarding playbooks and training',
      ].join('\n'),
    };
    const keywords = new Set(extractJobKeywords('SaaS support operations leader'));

    const bullets = buildDraftBulletsForSection(section, keywords);

    expect(bullets[0].text).toContain('support operations');
    expect((bullets[0].keywordOverlapCount ?? 0)).toBeGreaterThanOrEqual(
      bullets[1].keywordOverlapCount ?? 0,
    );
  });

  it('adds evidence metadata for each bullet in draft sections', () => {
    const draftSections = buildResumeDraftSections(
      [
        {
          id: 'section-2',
          sectionType: BaselineSectionType.SUMMARY,
          order: 0,
          title: 'Summary',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          content: 'Led support transformation with measurable outcomes.',
        } as never,
      ],
      { jobText: 'support transformation outcomes' },
    );

    expect(draftSections).toHaveLength(1);
    expect(draftSections[0].bullets).toHaveLength(1);
    expect(draftSections[0].bullets[0].source).toMatchObject({
      baselineSectionId: 'section-2',
      baselineSectionType: BaselineSectionType.SUMMARY,
      baselineSectionOrder: 0,
      bulletIndex: 0,
    });
    expect(draftSections[0].bullets[0].confidence).toBeTruthy();
  });
});
