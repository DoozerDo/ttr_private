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

    const bullets = buildDraftBulletsForSection(section, { keywords });

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

  it('reorders bullets inside each experience role while preserving role chronology', () => {
    const section = {
      id: 'section-experience',
      sectionType: BaselineSectionType.EXPERIENCE,
      order: 0,
      content: [
        'Director Support Operations | Acme | 2022 - Present',
        '- Built onboarding materials for new hires',
        '- Led escalation management, SLA recovery, and support operations',
        'Senior Manager | Beta | 2019 - 2022',
        '- Coordinated weekly team meetings',
        '- Owned incident response process and ServiceNow automation',
      ].join('\n'),
    };

    const bullets = buildDraftBulletsForSection(section, {
      jobSignals: undefined,
      keywords: new Set(
        extractJobKeywords(
          'support operations escalation incident response servicenow automation leadership',
        ),
      ),
    });

    // First role stays first (sourceIndex <= 2), but its most relevant bullet rises.
    expect(bullets[0].source.bulletIndex).toBeLessThanOrEqual(2);
    expect(bullets[1].source.bulletIndex).toBeLessThanOrEqual(2);
    expect(bullets[0].text.toLowerCase()).toContain('escalation');

    // Second role stays after first role bullets (sourceIndex >= 4), but is reordered inside role.
    expect(bullets[2].source.bulletIndex).toBeGreaterThanOrEqual(4);
    expect(bullets[3].source.bulletIndex).toBeGreaterThanOrEqual(4);
    expect(bullets[2].text.toLowerCase()).toContain('incident');
  });

  it('boosts platform and domain matched bullets over unrelated bullets', () => {
    const section = {
      id: 'section-platform',
      sectionType: BaselineSectionType.EXPERIENCE,
      order: 1,
      content: [
        '- Led hiring planning and internal mentoring cadence',
        '- Built ServiceNow workflows for enterprise SaaS support operations',
      ].join('\n'),
    };

    const draft = buildResumeDraftSections(
      [
        {
          ...section,
          includePolicy: BaselineIncludePolicy.ALWAYS,
          title: 'Experience',
        } as never,
      ],
      {
        jobText:
          'Own enterprise SaaS support operations with ServiceNow workflow automation.',
      },
    );

    expect(draft[0].bullets[0].text).toContain('ServiceNow workflows');
    expect((draft[0].bullets[0].relevance?.matchedCategories ?? []).length).toBeGreaterThan(0);
  });

  it('falls back to baseline order when job description is missing or weak', () => {
    const section = {
      id: 'section-fallback',
      sectionType: BaselineSectionType.EXPERIENCE,
      order: 2,
      content: [
        '- First baseline bullet',
        '- Second baseline bullet',
        '- Third baseline bullet',
      ].join('\n'),
    };

    const draft = buildResumeDraftSections(
      [
        {
          ...section,
          includePolicy: BaselineIncludePolicy.ALWAYS,
          title: 'Experience',
        } as never,
      ],
      { jobText: 'role' },
    );

    expect(draft[0].bullets.map((bullet) => bullet.text)).toEqual([
      'First baseline bullet',
      'Second baseline bullet',
      'Third baseline bullet',
    ]);
  });

  it('keeps output bullets grounded in baseline content only', () => {
    const content = [
      '- Reduced escalations through support process improvements',
      '- Implemented dashboard automation for incident trends',
    ].join('\n');

    const draft = buildResumeDraftSections(
      [
        {
          id: 'section-grounded',
          sectionType: BaselineSectionType.EXPERIENCE,
          order: 3,
          title: 'Experience',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          content,
        } as never,
      ],
      { jobText: 'incident support operations automation' },
    );

    const baselineBulletSet = new Set(
      splitSectionContentToBulletTexts(content).map((entry) => entry.text),
    );
    for (const bullet of draft[0].bullets) {
      expect(baselineBulletSet.has(bullet.text)).toBe(true);
    }
  });

  it('preserves original order when relevance scores are tied/weakly differentiated', () => {
    const section = {
      id: 'section-tie',
      sectionType: BaselineSectionType.EXPERIENCE,
      order: 4,
      content: ['- Led team operations', '- Led team delivery', '- Led team planning'].join('\n'),
    };

    const draft = buildResumeDraftSections(
      [
        {
          ...section,
          includePolicy: BaselineIncludePolicy.ALWAYS,
          title: 'Experience',
        } as never,
      ],
      { jobText: 'team leadership' },
    );

    expect(draft[0].bullets.map((bullet) => bullet.text)).toEqual([
      'Led team operations',
      'Led team delivery',
      'Led team planning',
    ]);
  });
});
