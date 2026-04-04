import { scoreCxFitV2 } from './cx-fit-scoring-v2';

const seniorBaselineSections = [
  {
    type: 'EXPERIENCE',
    content: `
      Senior Director of Cloud Operations overseeing global automation, governance creation, and executive reporting.
      Owns budgets, drives capacity planning, and manages managers across teams delivering incident management, reliability, and tooling roadmaps.
    `,
  },
  {
    type: 'SKILLS',
    content: 'AWS, infrastructure automation, governance creation, capacity planning',
  },
];

const juniorDevOpsJob = {
  rawDescription: `
    We're looking for a junior DevOps engineer to own CI/CD pipelines, automation playbooks, and runbooks for AWS workloads.
    The role supports incident response and operational reliability while reporting to an engineering manager and supporting automation initiatives.
  `,
  normalizedResponsibilities: [
    'Maintain CI/CD pipelines and automation playbooks for AWS services',
    'Support incident response, runbooks, and automation efforts alongside senior SREs',
  ],
  normalizedRequirements: [
    '1+ years of hands-on cloud automation, Terraform, and scripting experience',
    'Familiar with AWS, monitoring tooling, and operational runbooks in a collaborative engineering team',
  ],
};

const directorBaselineSections = [
  {
    type: 'EXPERIENCE',
    content: `
      Director of Infrastructure leading strategy and execution for global platform delivery.
      Guides operating model design, tooling roadmaps, and stakeholder governance while managing managers and reporting to the executive team.
    `,
  },
];

const directorJob = {
  rawDescription: `
    Director-level leader who guides platform strategy, governance creation, and executive communication for reliability and automation efforts.
    Establishes tooling roadmaps and leads multi-region operations while mentoring managers and collaborating on capacity planning.
  `,
  normalizedResponsibilities: [
    'Lead platform strategy, governance creation, and executive communication for reliability',
    'Guide tooling roadmaps and mentor managers across multi-region operations',
  ],
  normalizedRequirements: [
    'Experience directing platform delivery, tooling roadmap planning, and governance creation with executive reporting',
  ],
};

const parseBand = (bandLabel: string) => Number(bandLabel.replace(/^L/, ''));

describe('scoreCxFitV2 role band inference', () => {
  it('classifies junior DevOps as IC while keeping baseline senior', () => {
    const result = scoreCxFitV2({
      job: juniorDevOpsJob,
      jobTitle: 'Junior DevOps Engineer',
      baselineSections: seniorBaselineSections,
    });

    const roleBand = parseBand(result.debug.roleBand);
    const baselineBand = parseBand(result.debug.baselineBand);

    expect(roleBand).toBeLessThan(7);
    expect(baselineBand).toBeGreaterThanOrEqual(7);
    expect(result.debug.bandDelta).toBeGreaterThanOrEqual(2);
    expect(result.debug.changeLeadershipEligibility).toBe('ineligible_ic_role');
    expect(result.debug.redistributedWeightFrom).toBe(15);
    expect(result.debug.roleImpliedStrategyFloorApplied).toBe(false);
  });

  it('keeps director-level roles eligible for leadership signals', () => {
    const result = scoreCxFitV2({
      job: directorJob,
      jobTitle: 'Director of Infrastructure',
      baselineSections: directorBaselineSections,
    });

    const roleBand = parseBand(result.debug.roleBand);
    expect(roleBand).toBeGreaterThanOrEqual(7);
    expect(result.debug.changeLeadershipEligibility).toBe('eligible');
    expect(result.debug.roleImpliedStrategyFloorApplied).toBe(true);
  });
});
