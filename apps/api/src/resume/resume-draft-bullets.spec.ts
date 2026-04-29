import { BaselineIncludePolicy, BaselineSectionType } from '../baseline/baseline-section.entity';
import {
  buildDraftBulletsForSection,
  buildResumeDraftSections,
  extractEvidenceUnitsFromLogicalUnits,
  extractJobKeywords,
  reconstructLogicalTextUnits,
  splitSectionContentToBulletTexts,
  validateResumeDraftBulletAnchors,
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

  it('suppresses malformed summary and empty competency placeholders in draft sections', () => {
    const draft = buildResumeDraftSections(
      [
        {
          id: 'section-summary-bad',
          sectionType: BaselineSectionType.SUMMARY,
          order: 0,
          title: 'Summary',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          content: 'Summary\n•\n•\n•',
        } as never,
        {
          id: 'section-skills-bad',
          sectionType: BaselineSectionType.SKILLS,
          order: 1,
          title: 'Skills',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          content: '•  •  •',
        } as never,
      ],
      { jobText: 'support operations leadership' },
    );

    expect(draft).toHaveLength(0);
  });

  it('splits inline experience bullets into separate preserved bullet items', () => {
    const section = {
      id: 'section-inline-bullets',
      sectionType: BaselineSectionType.EXPERIENCE,
      order: 1,
      content: [
        'Support Operations Manager | Example Co | 2021 - 2025',
        '• Managed incident workflows • Led billing support operations • Directed two team members',
      ].join('\n'),
    };

    const bullets = buildDraftBulletsForSection(section, {
      keywords: new Set(extractJobKeywords('incident billing support operations leadership')),
    });

    expect(bullets.map((bullet) => bullet.text)).toEqual([
      'Led billing support operations',
      'Managed incident workflows',
      'Directed two team members',
    ]);
  });

  it('reconstructs wrapped PDF bullet lines before bullet extraction', () => {
    const section = {
      id: 'section-pdf-wrapped-bullets',
      sectionType: BaselineSectionType.EXPERIENCE,
      order: 1,
      content: [
        'Senior Game Designer | Cat Daddy Games | 2020 - 2025',
        '- Launched signature interactive features including SuperStar Spinner, Alt. Positions,',
        'courtside pass, and',
        'reward-track improvements that increased engagement.',
      ].join('\n'),
    };

    const bullets = buildDraftBulletsForSection(section, {
      keywords: new Set(extractJobKeywords('game design live operations engagement')),
    });

    expect(bullets.map((bullet) => bullet.text)).toEqual([
      'Launched signature interactive features including SuperStar Spinner, Alt. Positions, courtside pass, and reward-track improvements that increased engagement.',
    ]);
  });

  it('deduplicates repeated experience bullets within the same entry', () => {
    const section = {
      id: 'section-duplicate-bullets',
      sectionType: BaselineSectionType.EXPERIENCE,
      order: 1,
      content: [
        'Senior Game Designer | Cat Daddy Games | 2020 - 2025',
        '- Improved progression balance across player cohorts.',
        '- Improved progression balance across player cohorts.',
      ].join('\n'),
    };

    const bullets = buildDraftBulletsForSection(section, {
      keywords: new Set(extractJobKeywords('progression balance design')),
    });

    expect(bullets.map((bullet) => bullet.text)).toEqual([
      'Improved progression balance across player cohorts.',
    ]);
  });

  it('merges continuation bullets that end with including and across', () => {
    const section = {
      id: 'section-continuation-terms',
      sectionType: BaselineSectionType.EXPERIENCE,
      order: 1,
      content: [
        'Senior Game Designer | Cat Daddy Games | 2020 - 2025',
        '- Built progression systems including',
        'economy tuning across',
        'multiple player cohorts and event schedules.',
      ].join('\n'),
    };

    const bullets = buildDraftBulletsForSection(section, {
      keywords: new Set(extractJobKeywords('progression systems economy tuning')),
    });

    expect(bullets.map((bullet) => bullet.text)).toEqual([
      'Built progression systems including economy tuning across multiple player cohorts and event schedules.',
    ]);
  });

  it('keeps bullets scoped to each role and excludes heading fragments from experience bullets', () => {
    const draft = buildResumeDraftSections(
      [
        {
          id: 'section-role-scope',
          sectionType: BaselineSectionType.EXPERIENCE,
          order: 0,
          title: 'Experience',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          content: [
            'Director, Support Operations | Alpha Co | 2022 - Present',
            '- Led incident escalation governance and SLA recovery for enterprise support.',
            '- Owned ServiceNow queue operations and support workflow design.',
            'Automation & AI-Enabled Operations',
            'Senior Manager, Customer Support | Beta Co | 2018 - 2022',
            '- Built staffing forecasts and coaching cadence for frontline support teams.',
            '- Improved onboarding process quality across regional support pods.',
          ].join('\n'),
        } as never,
      ],
      { jobText: 'incident escalation support operations servicenow leadership' },
    );

    expect(draft).toHaveLength(1);
    const [experience] = draft;
    expect(experience.type).toBe(BaselineSectionType.EXPERIENCE);

    const entryIndexes = experience.bullets.map(
      (bullet) => bullet.source.experienceEntryIndex,
    );
    expect(entryIndexes).toEqual([0, 0, 1, 1]);

    expect(experience.bullets.map((bullet) => bullet.text)).not.toContain(
      'Automation & AI-Enabled Operations',
    );

    expect(experience.content).toContain(
      'Director, Support Operations | Alpha Co | 2022 - Present',
    );
    expect(experience.content).toContain(
      'Senior Manager, Customer Support | Beta Co | 2018 - 2022',
    );

    const directorHeaderIndex = experience.content.indexOf(
      'Director, Support Operations | Alpha Co | 2022 - Present',
    );
    const seniorHeaderIndex = experience.content.indexOf(
      'Senior Manager, Customer Support | Beta Co | 2018 - 2022',
    );
    expect(directorHeaderIndex).toBeGreaterThanOrEqual(0);
    expect(seniorHeaderIndex).toBeGreaterThan(directorHeaderIndex);

    const directorBulletIndex = experience.content.indexOf(
      '• Owned ServiceNow queue operations and support workflow design.',
    );
    const seniorBulletIndex = experience.content.indexOf(
      '• Built staffing forecasts and coaching cadence for frontline support teams.',
    );
    expect(directorBulletIndex).toBeGreaterThan(directorHeaderIndex);
    expect(seniorBulletIndex).toBeGreaterThan(seniorHeaderIndex);
  });

  it('limits experience bullets per role to the configured maximum', () => {
    const draft = buildResumeDraftSections(
      [
        {
          id: 'section-bullet-limit',
          sectionType: BaselineSectionType.EXPERIENCE,
          order: 0,
          title: 'Experience',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          content: [
            'Manager | Example Co | 2020 - 2024',
            '- Bullet 1',
            '- Bullet 2',
            '- Bullet 3',
            '- Bullet 4',
            '- Bullet 5',
            '- Bullet 6',
            '- Bullet 7',
          ].join('\n'),
        } as never,
      ],
      { jobText: 'bullet' },
    );

    expect(draft[0].bullets).toHaveLength(6);
  });

  it('produces stable output across runs for the same baseline and job text', () => {
    const sections = [
      {
        id: 'section-stable',
        sectionType: BaselineSectionType.EXPERIENCE,
        order: 0,
        title: 'Experience',
        includePolicy: BaselineIncludePolicy.ALWAYS,
        content: [
          'Director | Example Co | 2020 - Present',
          '- Led support operations and incident response',
          '- Built automation for recurring workflows',
        ].join('\n'),
      } as never,
    ];

    const request = { jobText: 'support operations automation leadership' };
    const first = buildResumeDraftSections(sections, request);
    const second = buildResumeDraftSections(sections, request);

    expect(second).toEqual(first);
  });

  it('retains experience sections when bullet extraction yields none but raw experience content exists', () => {
    const draft = buildResumeDraftSections(
      [
        {
          id: 'section-experience-no-bullets',
          sectionType: BaselineSectionType.EXPERIENCE,
          order: 0,
          title: 'Experience',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          content: [
            'support operations manager | acme | 2021 - present',
            'support operations manager | beta | 2019 - 2021',
          ].join('\n'),
        } as never,
      ],
      { jobText: 'support operations leadership' },
    );

    expect(draft).toHaveLength(1);
    expect(draft[0].type).toBe(BaselineSectionType.EXPERIENCE);
    expect(draft[0].content.length).toBeGreaterThan(0);
  });

  it('rejects partial sentence fragments that are not complete baseline sentence spans', () => {
    const result = splitSectionContentToBulletTexts(
      ['needed', 'well as the backend infrastructure', 'and platform'].join('\n'),
    );

    expect(result).toEqual([]);
  });

  it('rejects stitched conjunction fragments in experience bullet drafting', () => {
    const section = {
      id: 'section-fragment-reject',
      sectionType: BaselineSectionType.EXPERIENCE,
      order: 1,
      content: [
        'Platform Engineer | Example Co | 2020 - 2024',
        '- As well as the backend infrastructure',
        '- And',
      ].join('\n'),
    };

    const bullets = buildDraftBulletsForSection(section, {
      keywords: new Set(extractJobKeywords('platform engineering backend operations')),
    });

    expect(bullets).toEqual([]);
  });

  it('adds source anchoring metadata for drafted bullets', () => {
    const section = {
      id: 'section-anchor-metadata',
      sectionType: BaselineSectionType.EXPERIENCE,
      order: 1,
      content: [
        'Support Operations Manager | Example Co | 2021 - 2025',
        '- Managed incident workflows and escalation governance.',
      ].join('\n'),
    };

    const bullets = buildDraftBulletsForSection(section, {
      keywords: new Set(extractJobKeywords('incident escalation support operations')),
    });

    expect(bullets).toHaveLength(1);
    expect(bullets[0].source).toMatchObject({
      anchorKind: 'bullet_line',
      exactBaselineBullet: true,
      anchorText: 'Managed incident workflows and escalation governance.',
    });
  });

  it('rejects lowercase sentence starts when deriving sentence candidates', () => {
    const result = splitSectionContentToBulletTexts(
      'we led support operations improvements and incident recovery.',
    );

    expect(result).toEqual([]);
  });

  it('rejects sentence candidates that do not end with terminal punctuation', () => {
    const result = splitSectionContentToBulletTexts(
      'We led support operations improvements and incident recovery',
    );

    expect(result).toEqual([]);
  });

  it('maps sentence-derived bullets to full baseline sentence spans', () => {
    const content =
      'We led support operations improvements and reduced escalation volume across enterprise queues.';

    const draft = buildResumeDraftSections(
      [
        {
          id: 'section-sentence-span',
          sectionType: BaselineSectionType.OTHER,
          order: 0,
          title: 'Highlights',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          content,
        } as never,
      ],
      { jobText: 'support operations escalation leadership' },
    );

    expect(draft).toHaveLength(1);
    expect(draft[0].bullets).toHaveLength(1);
    expect(draft[0].bullets[0].source).toMatchObject({
      anchorKind: 'sentence',
      anchorText: content,
      exactBaselineBullet: false,
    });
  });

  it('rejects anchor validation when sentence bullets are not full baseline sentence spans', () => {
    const validation = validateResumeDraftBulletAnchors(
      [
        {
          id: 'section-x',
          type: BaselineSectionType.EXPERIENCE,
          title: 'Experience',
          order: 0,
          includePolicy: BaselineIncludePolicy.ALWAYS,
          source: 'baseline',
          content: 'well as the backend infrastructure.',
          bullets: [
            {
              id: 'bullet-x',
              text: 'well as the backend infrastructure.',
              confidence: 'Low',
              claimRisk: { level: 'None', flaggedTerms: [] },
              source: {
                baselineSectionId: 'section-x',
                baselineSectionType: BaselineSectionType.EXPERIENCE,
                baselineSectionOrder: 0,
                bulletIndex: 0,
                anchorText: 'well as the backend infrastructure.',
                anchorKind: 'sentence',
                exactBaselineBullet: false,
              },
            },
          ],
        },
      ],
      [
        {
          id: 'section-x',
          content:
            'We improved backend reliability through platform hardening and operational safeguards.',
        } as never,
      ],
    );

    expect(validation.valid).toBe(false);
    expect(validation.reasons.join(' ')).toContain('sentence fragment');
  });

  it('reconstructs wrapped DOCX bullet lines into single logical units', () => {
    const units = reconstructLogicalTextUnits(
      [
        '- Served as the Windows stack SME for the bleeding edge',
        'project and built out all needed systems/services using',
        'infrastructure as code.',
      ].join('\n'),
    );

    expect(units).toHaveLength(1);
    expect(units[0].text).toBe(
      'Served as the Windows stack SME for the bleeding edge project and built out all needed systems/services using infrastructure as code.',
    );
  });

  it('does not emit mid-sentence fragments as evidence units', () => {
    const units = reconstructLogicalTextUnits(
      ['needed', 'well as the backend infrastructure', 'the Windows stack SME for'].join('\n'),
    );
    const evidence = extractEvidenceUnitsFromLogicalUnits('section-fragment', units);
    expect(evidence).toEqual([]);
  });

  it('preserves baseline source spans for evidence units', () => {
    const units = reconstructLogicalTextUnits(
      ['- Improved release operations.', '- Reduced escalation volume by 20%.'].join('\n'),
    );
    const evidence = extractEvidenceUnitsFromLogicalUnits('section-spans', units);

    expect(evidence).toHaveLength(2);
    expect(evidence[0].sourceSpan).toMatchObject({ startLine: 0, endLine: 0 });
    expect(evidence[1].sourceSpan).toMatchObject({ startLine: 1, endLine: 1 });
  });

  it('adds sourceEvidenceIds on drafted bullets', () => {
    const section = {
      id: 'section-evidence-ids',
      sectionType: BaselineSectionType.EXPERIENCE,
      order: 1,
      content: ['Manager | Example Co | 2022 - Present', '- Improved support quality outcomes.'].join(
        '\n',
      ),
    };

    const bullets = buildDraftBulletsForSection(section, {
      keywords: new Set(extractJobKeywords('support quality outcomes')),
    });

    expect(bullets).toHaveLength(1);
    expect(bullets[0].source.sourceEvidenceIds?.length ?? 0).toBeGreaterThan(0);
  });

  it('prevents fragment spans from reaching draft bullets', () => {
    const draft = buildResumeDraftSections(
      [
        {
          id: 'section-no-fragments',
          sectionType: BaselineSectionType.EXPERIENCE,
          order: 0,
          title: 'Experience',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          content: ['- needed', '- well as the backend infrastructure', '- the Windows stack SME for'].join(
            '\n',
          ),
        } as never,
      ],
      { jobText: 'support operations' },
    );

    const bulletTexts = draft.flatMap((section) => section.bullets.map((bullet) => bullet.text));
    expect(bulletTexts).toEqual([]);
  });

  it('rejects bullets that end with dangling terminal words (ex: "The")', () => {
    const draft = buildResumeDraftSections(
      [
        {
          id: 'section-dangling-terminal',
          sectionType: BaselineSectionType.EXPERIENCE,
          order: 0,
          title: 'Experience',
          includePolicy: BaselineIncludePolicy.ALWAYS,
          content: [
            '- Designed and built a full-stack production platform for Conquest of Fates (cof.gg), a sci-fi trading card game. The',
          ].join('\n'),
        } as never,
      ],
      { jobText: 'full stack platform' },
    );

    const bulletTexts = draft.flatMap((section) => section.bullets.map((bullet) => bullet.text));
    expect(bulletTexts).toEqual([]);
  });
});
