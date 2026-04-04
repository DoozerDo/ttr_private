import fs from 'node:fs';
import path from 'node:path';
import { TemplateCoverLetterGenerator } from '../cover-letters/generators/template-cover-letter.generator';
import { buildResumeDraftSections } from '../resume/resume-draft-bullets';
import {
  buildNormalizedResumeDocument,
  buildResumePlainText,
  validateNormalizedResumeDocument,
} from '../resume/resume-normalization';

type Severity = 'low' | 'medium' | 'high';

type StressResult = {
  testCase: string;
  passed: boolean;
  failures: string[];
  severity: Severity;
};

type StressCase = {
  testCase: string;
  score: number;
  baselineSections: Array<{
    id: string;
    sectionType: string;
    title: string;
    order: number;
    includePolicy: string;
    content: string;
  }>;
  job: {
    id: string;
    title: string;
    company: string;
    responsibilities: string[];
    requirements: string[];
    descriptionText: string;
  };
  expectedRoleTitles?: string[];
};

const JD_ECHO_BLOCK_RATIO = 0.65;
const JD_REUSE_SNIPPET_LENGTH = 28;
const INFLATED_SCOPE_PATTERN =
  /\b(global(?:ly)?|worldwide|end[\s-]?to[\s-]?end|enterprise[\s-]?wide|org[\s-]?wide|all teams|entire company)\b/i;
const INVENTED_ENTITY_PATTERN =
  /\b(confidential company|stealth startup|fortune\s*\d{2,3}|unnamed company|undisclosed company)\b/i;
const BULLET_ARTIFACT_PATTERN = /^(?:[•*\-]\s+|\d{1,2}[.)]\s+)/m;

function computeTokenOverlapRatio(source: string, target: string): number {
  const sourceTokens = new Set(
    source
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
  const targetTokens = new Set(
    target
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
  if (!sourceTokens.size || !targetTokens.size) return 0;
  let overlap = 0;
  sourceTokens.forEach((token) => {
    if (targetTokens.has(token)) overlap += 1;
  });
  return overlap / Math.max(sourceTokens.size, 1);
}

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function computeWordCount(text: string): number {
  return text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean).length;
}

function buildJobDescription(job: StressCase['job']) {
  return [job.title, ...job.responsibilities, ...job.requirements, job.descriptionText]
    .filter(Boolean)
    .join(' ');
}

function summarizeSeverity(failures: string[]): Severity {
  if (failures.some((f) => /invented|inflate|echo|malformed|missing|mapping/i.test(f))) {
    return 'high';
  }
  if (failures.length >= 2) return 'medium';
  return 'low';
}

function runCase(testCase: StressCase): StressResult {
  const jobText = buildJobDescription(testCase.job);
  const drafted = buildResumeDraftSections(testCase.baselineSections as never, { jobText });
  const resumeDoc = buildNormalizedResumeDocument(drafted as never, {
    name: 'Taylor Candidate',
    location: 'taylor@example.com | (555) 222-1234',
  });
  const resumePreview = buildResumePlainText(resumeDoc);
  expect(resumePreview.length).toBeGreaterThan(0);

  const failures: string[] = [];
  const normalizedValidation = validateNormalizedResumeDocument(resumeDoc);
  failures.push(...normalizedValidation.reasons.map((r) => `formatting issues: ${r}`));

  const roleTitles = resumeDoc.experience.map((entry) => entry.roleTitle.trim().toLowerCase());
  if (testCase.expectedRoleTitles?.length) {
    for (const expectedRole of testCase.expectedRoleTitles) {
      if (!roleTitles.includes(expectedRole.toLowerCase())) {
        failures.push(`role mapping errors: expected role "${expectedRole}" not preserved.`);
      }
    }
  }

  const coverGenerator = new TemplateCoverLetterGenerator();
  const cover = coverGenerator.generate({
    baselineId: 'baseline-stress',
    jobId: testCase.job.id,
    allowedBaselineBlocks: testCase.baselineSections.map((section) => ({
      id: section.id,
      title: section.title,
      content: section.content,
      includePolicy: section.includePolicy as 'ALWAYS' | 'OPTIONAL' | 'EXCLUDE_FROM_GENERATION',
      order: section.order,
      sectionType: section.sectionType as 'SUMMARY' | 'SKILLS' | 'EXPERIENCE' | 'EDUCATION' | 'OTHER',
    })),
    job: {
      id: testCase.job.id,
      title: testCase.job.title,
      company: testCase.job.company,
      responsibilities: testCase.job.responsibilities,
      requirements: testCase.job.requirements,
    },
    candidateName: 'Taylor Candidate',
  });

  const canonicalParagraphs =
    cover.paragraphs.length > 0
      ? cover.paragraphs
      : [cover.document.opening, ...cover.document.bodyParagraphs, cover.document.closingParagraph];
  const coverText = [cover.greeting, ...canonicalParagraphs].join('\n\n');
  const coverWordCount = computeWordCount(coverText);
  if (coverWordCount < 250 || coverWordCount > 400) {
    failures.push('formatting issues: cover letter word count must be 250-400 words.');
  }
  if (cover.paragraphs.length < 4) {
    failures.push('formatting issues: cover letter should contain at least 4 paragraphs.');
  }
  if (BULLET_ARTIFACT_PATTERN.test(coverText)) {
    failures.push('formatting issues: bullet artifact detected in cover letter.');
  }

  const overlapRatio = computeTokenOverlapRatio(coverText, testCase.job.descriptionText);
  const normalizedJd = normalizeLine(testCase.job.descriptionText).toLowerCase();
  const normalizedCover = normalizeLine(coverText).toLowerCase();
  if (overlapRatio > JD_ECHO_BLOCK_RATIO) {
    failures.push('JD leakage: cover letter token overlap with JD exceeded threshold.');
  }
  if (
    normalizedJd.length >= JD_REUSE_SNIPPET_LENGTH &&
    normalizedCover.includes(normalizedJd.slice(0, JD_REUSE_SNIPPET_LENGTH))
  ) {
    failures.push('JD leakage: cover letter reuses JD sentence fragment.');
  }

  if (INVENTED_ENTITY_PATTERN.test(resumePreview) || INVENTED_ENTITY_PATTERN.test(coverText)) {
    failures.push('invented or inflated claims: invented company/role placeholder detected.');
  }
  if (INFLATED_SCOPE_PATTERN.test(resumePreview) || INFLATED_SCOPE_PATTERN.test(coverText)) {
    failures.push('invented or inflated claims: inflated scope phrase detected.');
  }

  const repetitiveBuzzword = /\binnovation\b/gi;
  const buzzwordCount = (coverText.match(repetitiveBuzzword) ?? []).length;
  if (buzzwordCount >= 5) {
    failures.push('tone problems: repetitive buzzword-heavy narrative.');
  }

  if (testCase.score >= 92 && failures.length > 0) {
    failures.push('high score case failed output quality checks.');
  }
  if (testCase.score >= 85 && testCase.score <= 89 && failures.length > 0) {
    failures.push('borderline score case exposed quality issues.');
  }

  const deduped = Array.from(new Set(failures));
  return {
    testCase: testCase.testCase,
    passed: deduped.length === 0,
    failures: deduped,
    severity: deduped.length === 0 ? 'low' : summarizeSeverity(deduped),
  };
}

const sharedResponsibilities = [
  'Lead cross-functional planning and delivery across product, design, and engineering',
  'Drive measurable improvements in activation, retention, and operational efficiency',
  'Partner with stakeholders to turn ambiguous priorities into executable roadmaps',
];

const sharedRequirements = [
  'Strong communication and structured problem-solving',
  'Experience driving cross-team initiatives in fast-moving environments',
  'Ability to translate strategy into execution with measurable outcomes',
];

const stressCases: StressCase[] = [
  {
    testCase: '1. Clean baseline, strong match',
    score: 94,
    baselineSections: [
      {
        id: 's1-summary',
        sectionType: 'SUMMARY',
        title: 'Summary',
        order: 1,
        includePolicy: 'ALWAYS',
        content:
          'Product operations leader with 8 years delivering measurable growth across SaaS onboarding, retention, and lifecycle programs.',
      },
      {
        id: 's1-exp',
        sectionType: 'EXPERIENCE',
        title: 'Experience',
        order: 2,
        includePolicy: 'ALWAYS',
        content:
          'Northstar Cloud | Senior Product Operations Manager | 2021 - Present\n- Built onboarding experiments that increased activation by 21 percent.\n- Partnered with engineering and analytics to automate weekly funnel diagnostics.\n- Led roadmap planning and KPI review rituals across GTM and product teams.',
      },
    ],
    job: {
      id: 'job-1',
      title: 'Senior Product Operations Manager',
      company: 'Apex SaaS',
      responsibilities: sharedResponsibilities,
      requirements: sharedRequirements,
      descriptionText:
        'We need a senior product operations manager to improve activation and retention using data, cross-functional leadership, and measurable execution.',
    },
    expectedRoleTitles: ['Senior Product Operations Manager'],
  },
  {
    testCase: '2. Baseline with messy bullet formatting',
    score: 90,
    baselineSections: [
      {
        id: 's2-exp',
        sectionType: 'EXPERIENCE',
        title: 'Experience',
        order: 1,
        includePolicy: 'ALWAYS',
        content:
          'Orbit Systems | Program Manager | 2019 - Present\n- Led migration plan across 11 teams and\n  reduced release defects by 32 percent while coordinating\n  partner dependencies across support and QA\n- Built KPI deck for leadership,\n  and rolled out weekly risk review process\n- and shipped',
      },
    ],
    job: {
      id: 'job-2',
      title: 'Program Manager',
      company: 'Orbit Growth',
      responsibilities: sharedResponsibilities,
      requirements: sharedRequirements,
      descriptionText:
        'Need a program manager with structured delivery, metrics ownership, and executive communication.',
    },
    expectedRoleTitles: ['Program Manager'],
  },
  {
    testCase: '3. Baseline with multiple roles at same company',
    score: 91,
    baselineSections: [
      {
        id: 's3-exp',
        sectionType: 'EXPERIENCE',
        title: 'Experience',
        order: 1,
        includePolicy: 'ALWAYS',
        content:
          'Vector Labs | Senior Manager, Operations | 2022 - Present\n- Owned operational planning for enterprise customer onboarding.\n- Reduced time-to-value by 18 percent through process redesign.\nVector Labs | Operations Manager | 2019 - 2022\n- Built support handoff workflows and incident postmortem cadence.\n- Improved SLA attainment from 82 to 95 percent.',
      },
    ],
    job: {
      id: 'job-3',
      title: 'Senior Operations Manager',
      company: 'Vector Labs',
      responsibilities: sharedResponsibilities,
      requirements: sharedRequirements,
      descriptionText:
        'Looking for an operations manager who can scale processes and lead cross-functional teams.',
    },
    expectedRoleTitles: ['Senior Manager, Operations', 'Operations Manager'],
  },
  {
    testCase: '4. Baseline missing explicit SaaS keywords but implying them',
    score: 88,
    baselineSections: [
      {
        id: 's4-exp',
        sectionType: 'EXPERIENCE',
        title: 'Experience',
        order: 1,
        includePolicy: 'ALWAYS',
        content:
          'Customer Platform Team | Delivery Lead | 2020 - Present\n- Improved trial-to-paid conversion through lifecycle onboarding changes.\n- Coordinated release reviews with product analytics and support operations.',
      },
    ],
    job: {
      id: 'job-4',
      title: 'SaaS Growth Operations Lead',
      company: 'Acorn Software',
      responsibilities: sharedResponsibilities,
      requirements: [...sharedRequirements, 'Experience in SaaS product-led growth environments'],
      descriptionText:
        'SaaS growth leader needed for PLG funnel optimization, lifecycle growth, and retention strategy.',
    },
    expectedRoleTitles: ['Delivery Lead'],
  },
  {
    testCase: '5. Job description with heavy buzzwords and repeated phrases',
    score: 93,
    baselineSections: [
      {
        id: 's5-exp',
        sectionType: 'EXPERIENCE',
        title: 'Experience',
        order: 1,
        includePolicy: 'ALWAYS',
        content:
          'Launchpad Inc | Product Lead | 2021 - Present\n- Delivered roadmap milestones across onboarding, retention, and lifecycle optimization.\n- Built KPI monitoring for executive weekly reviews.',
      },
    ],
    job: {
      id: 'job-5',
      title: 'Product Lead',
      company: 'Buzzword AI',
      responsibilities: [
        'Drive innovation at scale with innovation-first innovation principles',
        'Own strategic strategic strategy for transformational transformation',
      ],
      requirements: [
        'Leverage synergy, alignment, and strategic synergy repeatedly',
        'Enable world-class innovation innovation innovation across all teams',
      ],
      descriptionText:
        'We need innovation at scale, strategic transformation, synergy, and world-class innovation across all teams. Strategic innovation and synergy are core.',
    },
    expectedRoleTitles: ['Product Lead'],
  },
  {
    testCase: '6. Job description with ambiguous requirements',
    score: 86,
    baselineSections: [
      {
        id: 's6-exp',
        sectionType: 'EXPERIENCE',
        title: 'Experience',
        order: 1,
        includePolicy: 'ALWAYS',
        content:
          'Brightline Services | Operations Lead | 2018 - Present\n- Ran cross-team execution plans for undefined strategic initiatives.\n- Improved planning cadence and reduced deadline slips by 19 percent.',
      },
    ],
    job: {
      id: 'job-6',
      title: 'Strategic Generalist',
      company: 'Undefined Co',
      responsibilities: ['Do what is needed across teams', 'Own outcomes where possible', 'Help where required'],
      requirements: ['Strong presence', 'Good instincts', 'Can handle ambiguity'],
      descriptionText:
        'Seeking a strategic generalist to do whatever is needed in a fast-paced environment.',
    },
    expectedRoleTitles: ['Operations Lead'],
  },
  {
    testCase: '7. High score (>=92) case',
    score: 96,
    baselineSections: [
      {
        id: 's7-exp',
        sectionType: 'EXPERIENCE',
        title: 'Experience',
        order: 1,
        includePolicy: 'ALWAYS',
        content:
          'ScaleOps | Head of Growth Operations | 2020 - Present\n- Scaled lifecycle experimentation program and increased retention by 24 percent.\n- Implemented governance for KPI reviews with product and finance.\n- Reduced manual reporting by 70 percent through analytics automation.',
      },
    ],
    job: {
      id: 'job-7',
      title: 'Head of Growth Operations',
      company: 'ScaleOps',
      responsibilities: sharedResponsibilities,
      requirements: sharedRequirements,
      descriptionText:
        'Head of growth operations role focused on retention, scale, and measurable impact.',
    },
    expectedRoleTitles: ['Head of Growth Operations'],
  },
  {
    testCase: '8. Borderline score (85-89) case',
    score: 87,
    baselineSections: [
      {
        id: 's8-exp',
        sectionType: 'EXPERIENCE',
        title: 'Experience',
        order: 1,
        includePolicy: 'ALWAYS',
        content:
          'Nimble Team | Operations Specialist | 2021 - Present\n- Supported process documentation and launch readiness tasks.\n- Coordinated stakeholder updates and weekly execution check-ins.',
      },
    ],
    job: {
      id: 'job-8',
      title: 'Operations Manager',
      company: 'Nimble Team',
      responsibilities: sharedResponsibilities,
      requirements: sharedRequirements,
      descriptionText:
        'Operations manager needed to improve execution consistency and partner coordination.',
    },
    expectedRoleTitles: ['Operations Specialist'],
  },
];

describe('Generation stress scan', () => {
  it('runs eight stress cases and writes structured report', () => {
    const report = stressCases.map(runCase);
    const reportDir = path.resolve(process.cwd(), '../reports');
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportDir, 'generation-stress-report.json'),
      JSON.stringify(report, null, 2),
      'utf8',
    );
    expect(report).toHaveLength(8);
  });
});
