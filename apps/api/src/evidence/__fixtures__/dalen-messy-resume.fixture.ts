export const DALEN_MESSY_RESUME_FIXTURE = {
  candidate: {
    name: 'Dalen Example',
  },
  // Intentionally messy and imperfectly structured; contains real technical signals and responsibilities.
  // This fixture is used to define interpreter behavior (Phase 2 tests) without implying any real person.
  resumeText: [
    'EXPERIENCE',
    'Senior Software Engineer | Acme Systems | 2021 - 2024',
    'Built and maintained backend services using Node.js, PostgreSQL, and AWS.',
    'Contributed to incident response and improved escalation workflows.',
    'Responsible for various engineering tasks.',
    'Improved p95 API latency by 35% by optimizing database queries and caching.',
    '',
    'Projects / Other',
    'Worked on React frontend components (no claim about ownership).',
    '',
    'Skills',
    'Node.js, TypeScript, PostgreSQL, AWS, Docker',
    '',
    'Notes',
    'Avoid inferring team size, revenue impact, leadership scope, or tools not explicitly listed.',
  ].join('\n'),
  examples: {
    technicalNoMetrics: 'Built and maintained backend services using Node.js, PostgreSQL, and AWS.',
    contributionNoInflation: 'Contributed to incident response and improved escalation workflows.',
    vagueResponsibility: 'Responsible for various engineering tasks.',
    explicitMetricImpact: 'Improved p95 API latency by 35% by optimizing database queries and caching.',
    shouldNotInfer: 'Worked on React frontend components (no claim about ownership).',
  },
} as const;

