export const RESUME_V2_AUTHORITY_IMPOSSIBLE_MARKER =
  'IMPOSSIBLE_MARKER__BASELINE_SECTIONS_MUST_NOT_BE_USED__XYZ_9f2c6d';

export function buildCandidateSafeResumeV2Fixture(): any {
  return {
    heading: {
      name: 'Alex Candidate',
      contactLine: 'Test City | alex@example.com',
      links: [],
    },
    summary: 'Support leader with verified impact across incident response and operations.',
    competencies: ['Incident response', 'Operational leadership', 'Stakeholder communication'],
    coreCompetencies: [],
    experience: [
      {
        company: 'Acme',
        location: 'Remote',
        roleTitle: 'Director of Support',
        dateRange: '2020 - 2024',
        startDate: null,
        endDate: null,
        bullets: [
          'Led support operations and improved incident response quality through repeatable playbooks.',
          'Partnered cross-functionally to reduce escalation friction and improve stakeholder updates.',
        ],
      },
    ],
    education: [],
  };
}

export function buildPoisonedBaselineSections(): Array<{
  id?: string;
  title: string;
  content: string;
  sectionType: string;
}> {
  return [
    {
      id: 'section-poison',
      title: 'Experience',
      sectionType: 'EXPERIENCE',
      content: `This baseline section is poisoned: ${RESUME_V2_AUTHORITY_IMPOSSIBLE_MARKER}`,
    },
  ];
}
