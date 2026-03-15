import type { CoverLetterGenerationInput } from '../cover-letter-generator.interface';

export const gameDesignFixture: CoverLetterGenerationInput = {
  baselineId: 'baseline-game-1',
  jobId: 'job-game-1',
  candidateName: 'Alex Rivera',
  job: {
    id: 'job-game-1',
    title: 'Senior Game Designer',
    company: 'Northline Interactive',
    responsibilities: [
      'Shape core progression systems and collaborate with product and analytics.',
      'Partner with engineering and art to ship features on schedule.',
      'Use playtest feedback to improve retention and player satisfaction.',
    ],
    requirements: [
      'Experience balancing systems in a live product environment.',
      'Strong communication with design, product, and engineering teams.',
    ],
  },
  allowedBaselineBlocks: [
    {
      id: 'g1',
      title: 'Experience',
      content:
        'Designed progression and rewards systems for a live multiplayer title, then tuned economy and unlock pacing from weekly playtest feedback. Partnered with product managers, gameplay engineers, and artists to ship seasonal feature sets with clear scope and milestone ownership. Built experiment plans and post launch reviews that connected player behavior data with practical design changes. Defined encounter tuning goals with analytics partners and translated findings into prioritised system updates for each release cycle. Ran design reviews with engineering and content teams to keep implementation quality aligned with player facing goals. Documented feature intent, success criteria, and follow up actions so execution remained consistent across iterations. Coordinated launch readiness checklists with production and QA to reduce late cycle defects and improve release confidence. Incorporated community sentiment and structured playtest observations into actionable next sprint changes. Balanced retention objectives with fair progression pacing to support long term player trust. Supported seasonal roadmap planning by identifying system risks early and framing tradeoffs for stakeholders.',
      includePolicy: 'always' as any,
      order: 0,
      sectionType: 'experience' as any,
    },
  ],
  closingTemplate: {
    key: 'steady',
    text: 'Thank you for your consideration.',
  },
  maxWords: 320,
};

export const supportOperationsFixture: CoverLetterGenerationInput = {
  baselineId: 'baseline-ops-1',
  jobId: 'job-ops-1',
  candidateName: 'Jordan Lee',
  job: {
    id: 'job-ops-1',
    title: 'Support Operations Manager',
    company: 'Acme Care',
    responsibilities: [
      'Build support workflows and partner with product teams on root cause fixes.',
      'Improve response quality and coordinate performance reviews with team leads.',
    ],
    requirements: [
      'Experience with operational metrics and service reliability.',
      'Comfort leading cross functional projects and process changes.',
    ],
  },
  allowedBaselineBlocks: [
    {
      id: 'o1',
      title: 'Experience',
      content:
        'Led support operations for a high volume service organization and built intake, triage, and escalation routines that reduced repeat tickets. Worked with product and engineering partners to prioritize root cause fixes and stabilize the most frequent incident paths. Introduced coaching and QA review cycles so frontline teams had clearer standards and more reliable customer outcomes. Built weekly operating reviews that connected queue health, service quality, and staffing decisions for leadership. Documented escalation playbooks and ownership paths so cross functional response was faster and more predictable. Improved handoff routines between frontline support and specialist teams to reduce unresolved case loops. Partnered with enablement to refresh onboarding materials and reinforce quality standards through shadowing and calibration sessions. Consolidated recurring issue patterns and shared root cause themes with product partners during sprint planning. Introduced practical workflow guardrails that reduced avoidable backlog growth during peak demand periods. Maintained transparent progress reporting for incident readiness, backlog trends, and quality outcomes.',
      includePolicy: 'always' as any,
      order: 0,
      sectionType: 'experience' as any,
    },
  ],
  closingTemplate: {
    key: 'steady',
    text: 'Thank you for your consideration.',
  },
  maxWords: 320,
};
