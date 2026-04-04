import { BaselineIncludePolicy, BaselineSectionType } from '../baseline/baseline-section.entity';

export const dirtyResumeFixture = {
  baselineId: 'baseline-dirty',
  baselineVersionId: 'baseline-version-dirty',
  jobId: 'job-dirty',
  analysisId: 'analysis-dirty',
  userId: 'user-1',
  job: {
    id: 'job-dirty',
    title: 'Operations Manager',
    company: 'Dirty Systems',
    normalizedResponsibilities: [
      'Lead operational planning and cross-functional delivery',
      'Own reporting and escalation routines',
    ],
    normalizedRequirements: ['Strong communication', 'Metrics ownership'],
    rawDescription:
      'Operations manager role focused on delivery, reporting, and cross-functional coordination.',
  },
  assessment: {
    id: 'analysis-dirty',
    overallScore: 91,
  },
  baselineSections: [
    {
      id: 'dirty-summary',
      sectionType: BaselineSectionType.SUMMARY,
      title: 'Summary',
      order: 0,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      content:
        'Operations leader with measurable outcomes and strong stakeholder communication. Led planning, reporting, and escalation routines across cross-functional teams. Built repeatable operating cadences that improved delivery reliability and executive visibility. '.repeat(4) +
        'Summary | Summary',
    },
    {
      id: 'dirty-exp',
      sectionType: BaselineSectionType.EXPERIENCE,
      title: 'Experience',
      order: 1,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      content: [
        'Example Co | Operations Manager | 2021 - Present',
        '- Led operational planning across cross-functional teams and improved reporting cadence.',
        '- Built escalation routines that reduced response delays by 19 percent.',
        '- Managed backlog cleanup and documentation improvements.',
        'Example Co | Senior Operations Manager | 2018 - 2021',
        '- Directed operational readiness and executive reporting.',
        '- Reduced recurring process defects through workflow redesign.',
      ].join('\n'),
    },
    {
      id: 'dirty-edu',
      sectionType: BaselineSectionType.EDUCATION,
      title: 'Education',
      order: 2,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      content:
        'B.S. Business Administration | B.S. Business Administration | Example University | Example University | Example City, WA',
    },
    {
      id: 'dirty-skills',
      sectionType: BaselineSectionType.SKILLS,
      title: 'Skills',
      order: 3,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      content: 'Operations | Reporting | Escalation Management | Leadership',
    },
  ],
  jobDescription:
    'We need an operations manager who can lead planning, reporting, escalation routines, and cross-functional execution across the business.',
};

export const minimalResumeFixture = {
  baselineId: 'baseline-minimal',
  baselineVersionId: 'baseline-version-minimal',
  jobId: 'job-minimal',
  analysisId: 'analysis-minimal',
  userId: 'user-1',
  job: {
    id: 'job-minimal',
    title: 'Program Manager',
    company: 'Sparse Co',
    normalizedResponsibilities: ['Drive execution'],
    normalizedRequirements: ['Communicate clearly'],
    rawDescription: 'Program manager role for a lean team.',
  },
  assessment: {
    id: 'analysis-minimal',
    overallScore: 86,
  },
  baselineSections: [
    {
      id: 'minimal-exp',
      sectionType: BaselineSectionType.EXPERIENCE,
      title: 'Experience',
      order: 0,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      content:
        'LeanOps | Program Manager | 2022 - Present\n- Coordinated weekly execution check-ins. '.repeat(4) +
        '\n- Supported stakeholder updates. '.repeat(4),
    },
    {
      id: 'minimal-summary',
      sectionType: BaselineSectionType.SUMMARY,
      title: 'Summary',
      order: 1,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      content:
        'Execution-focused operator with experience coordinating delivery, communication, and reporting cadences. '.repeat(8),
    },
    {
      id: 'minimal-skills',
      sectionType: BaselineSectionType.SKILLS,
      title: 'Skills',
      order: 2,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      content: 'Planning | Communication',
    },
  ],
  jobDescription:
    'Need a program manager with execution discipline and clear communication for a multi-team environment.',
};

export const overloadedResumeFixture = {
  baselineId: 'baseline-overloaded',
  baselineVersionId: 'baseline-version-overloaded',
  jobId: 'job-overloaded',
  analysisId: 'analysis-overloaded',
  userId: 'user-1',
  job: {
    id: 'job-overloaded',
    title: 'Head of Operations',
    company: 'Scale House',
    normalizedResponsibilities: [
      'Scale operational delivery',
      'Improve metrics and governance',
      'Lead cross-functional programs',
    ],
    normalizedRequirements: ['Leadership', 'Metrics', 'Tooling'],
    rawDescription: 'Operations leader role with scope and scale across teams and systems.',
  },
  assessment: {
    id: 'analysis-overloaded',
    overallScore: 95,
  },
  baselineSections: [
    {
      id: 'over-exp',
      sectionType: BaselineSectionType.EXPERIENCE,
      title: 'Experience',
      order: 0,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      content: [
        'Scale House | Head of Operations | 2020 - Present',
        '- Led operational planning across product, support, and analytics. '.repeat(2),
        '- Reduced reporting lag by 43 percent through automation. '.repeat(2),
        '- Built governance rituals for weekly business reviews. '.repeat(2),
        '- Partnered with leadership on staffing and budget planning. '.repeat(2),
        '- Improved incident response coordination and service uptime. '.repeat(2),
        '- Drove KPI review discipline across multiple teams. '.repeat(2),
        '- Coordinated launch readiness for large cross-functional initiatives. '.repeat(2),
      ].join('\n'),
    },
    {
      id: 'over-summary',
      sectionType: BaselineSectionType.SUMMARY,
      title: 'Summary',
      order: 1,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      content: 'Operational leader with measurable impact. '.repeat(8),
    },
    {
      id: 'over-skills',
      sectionType: BaselineSectionType.SKILLS,
      title: 'Skills',
      order: 2,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      content: 'Operations | Governance | Automation | Metrics | Leadership',
    },
  ],
  jobDescription:
    'Need an operations leader to scale delivery, improve metrics, and coordinate governance across teams and programs. The role needs reliable cadence, cross-functional coordination, and measurable execution.',
};

export const paragraphOnlyResumeFixture = {
  baselineId: 'baseline-paragraph-only',
  baselineVersionId: 'baseline-version-paragraph-only',
  jobId: 'job-paragraph-only',
  analysisId: 'analysis-paragraph-only',
  userId: 'user-1',
  job: {
    id: 'job-paragraph-only',
    title: 'Operations Lead',
    company: 'Narrative Co',
    normalizedResponsibilities: ['Lead operations'],
    normalizedRequirements: ['Structured communication'],
    rawDescription: 'Lead operations with resilient systems.',
  },
  assessment: {
    id: 'analysis-paragraph-only',
    overallScore: 84,
  },
  baselineSections: [
    {
      id: 'para-exp',
      sectionType: BaselineSectionType.EXPERIENCE,
      title: 'Experience',
      order: 0,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      content:
        [
          'Narrative Co | Operations Lead | 2020 - Present',
          'I led weekly planning, built reporting cadences, and improved escalation response.',
          'I worked with finance, support, and product to keep execution on track.',
          'I documented follow up actions and tracked delivery risks so the team could maintain consistency across recurring work.',
          'I coordinated launch readiness, maintained executive updates, and strengthened weekly operating reviews.',
          'I turned narrative status updates into structured delivery notes for leadership.',
        ].join('\n'),
    },
    {
      id: 'para-summary',
      sectionType: BaselineSectionType.SUMMARY,
      title: 'Summary',
      order: 1,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      content: 'Hands-on operations lead with communication discipline. '.repeat(6),
    },
  ],
  jobDescription:
    'Need an operations lead who can turn narrative updates into structured delivery with reliable reporting and communication.',
};

export const jdHeavyCoverLetterFixture = {
  baselineId: 'baseline-jd-heavy',
  jobId: 'job-jd-heavy',
  candidateName: 'Jordan Lee',
  job: {
    id: 'job-jd-heavy',
    title: 'Support Operations Manager',
    company: 'Buzzword Systems',
    responsibilities: [
      'Drive innovation at scale with strategic innovation and synergy.',
      'Own transformation and operational excellence across all teams.',
      'Enable cross-functional alignment and world class execution.',
    ],
    requirements: [
      'Strategic synergy, innovation, and transformation leadership.',
      'Experience with enterprise-wide operational excellence.',
    ],
  },
  allowedBaselineBlocks: [
    {
      id: 'jd-heavy-exp',
      title: 'Experience',
      content:
        'Led support operations for a service team and improved queue health, escalation management, and weekly reporting. Built operating rhythms with product and engineering partners to reduce repeat tickets and improve response quality. Documented escalation paths, coordination routines, and measurement checkpoints so the team could maintain consistent execution. Partnered with frontline leads to turn recurring issues into practical process changes.',
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 0,
      sectionType: BaselineSectionType.EXPERIENCE,
    },
  ],
  closingTemplate: {
    key: 'steady',
    text: 'Thank you for your consideration.',
  },
  maxWords: 300,
};

export const jdHeavyResumeFixture = {
  baselineId: 'baseline-jd-heavy-resume',
  baselineVersionId: 'baseline-version-jd-heavy-resume',
  jobId: 'job-jd-heavy-resume',
  analysisId: 'analysis-jd-heavy-resume',
  userId: 'user-1',
  job: {
    id: 'job-jd-heavy-resume',
    title: 'Support Operations Manager',
    company: 'Buzzword Systems',
    normalizedResponsibilities: [
      'Drive innovation at scale',
      'Own transformation and synergy',
      'Enable cross-functional alignment',
    ],
    normalizedRequirements: ['Strategic leadership', 'Operations', 'Execution'],
    rawDescription:
      'We need innovation at scale, strategic transformation, synergy, and operational excellence across programs and teams. We want measurable delivery, reliable coordination, and practical execution.',
  },
  assessment: {
    id: 'analysis-jd-heavy-resume',
    overallScore: 92,
  },
  baselineSections: [
    {
      id: 'jd-heavy-resume-exp',
      sectionType: BaselineSectionType.EXPERIENCE,
      title: 'Experience',
      order: 0,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      content:
        'Support Labs | Support Operations Manager | 2021 - Present\n- Led operational planning for support workflows. '.repeat(3) +
        '\n- Reduced response time by 24 percent through queue analysis. '.repeat(3) +
        '\n- Built weekly business reviews and escalation tracking. '.repeat(3),
    },
    {
      id: 'jd-heavy-resume-summary',
      sectionType: BaselineSectionType.SUMMARY,
      title: 'Summary',
      order: 1,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      content: 'Support operations leader focused on measurable execution.',
    },
  ],
  jobDescription:
    'Need innovation at scale, strategic transformation, synergy, and operational excellence across all teams and workflows with reliable delivery and measurable execution.',
};
