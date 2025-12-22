import { FitScoringService } from './fit-scoring.service';

const buildInput = (overrides?: Partial<Parameters<FitScoringService['score']>[0]>) => ({
  job: {
    title: 'Senior Platform Engineer',
    company: 'ExampleCo',
    rawDescription:
      'Lead platform initiatives, define strategy, and deliver cloud infrastructure using AWS and Kubernetes.',
    normalizedResponsibilities: [
      'Lead platform strategy and roadmap',
      'Deliver cloud infrastructure on AWS and Kubernetes',
    ],
    normalizedRequirements: ['Experience with AWS, Kubernetes, Terraform, and CI CD pipelines'],
    sourceUrl: 'https://example.com/jobs/role',
  },
  baseline: {
    version: 2,
    sections: [
      {
        type: 'EXPERIENCE',
        content:
          'Led cloud platform migrations, owned roadmap, and delivered Kubernetes clusters on AWS.',
      },
      {
        type: 'SKILLS',
        content: 'AWS, Kubernetes, Terraform, CI/CD, GitHub Actions',
      },
    ],
  },
  ...overrides,
});

describe('FitScoringService', () => {
  const service = new FitScoringService();

  it('returns strong technical platform fit when baseline matches', () => {
    const result = service.score(buildInput());
    expect(result.dimensionScores.technicalPlatformFit).toBeGreaterThanOrEqual(80);
    expect(result.overallScore).toBeGreaterThan(70);
  });

  it('identifies gaps when technical tokens are missing', () => {
    const result = service.score(
      buildInput({
        baseline: {
          version: 1,
          sections: [
            {
              type: 'EXPERIENCE',
              content: 'Managed on-prem infrastructure and legacy systems.',
            },
          ],
        },
      }),
    );

    expect(result.dimensionScores.technicalPlatformFit).toBeLessThan(60);
    expect(result.gaps).toEqual(expect.arrayContaining(['kubernetes']));
  });

  it('keeps industry context neutral when job has no industry cues', () => {
    const result = service.score(
      buildInput({
        job: {
          title: 'Platform Engineer',
          company: 'ExampleCo',
          rawDescription: 'Build scalable infrastructure and automate deployments.',
          normalizedResponsibilities: ['Build scalable infrastructure and automate deployments'],
          normalizedRequirements: ['Experience with automation and cloud platforms'],
          sourceUrl: null,
        },
      }),
    );

    expect(result.dimensionScores.industryContext).toBe(60);
  });

  it('reduces strategic vs tactical score when orientations mismatch', () => {
    const result = service.score(
      buildInput({
        job: {
          title: 'Staff Platform Engineer',
          company: 'ExampleCo',
          rawDescription: 'Own strategy, vision, architecture, and roadmap for the platform team.',
          normalizedResponsibilities: ['Define strategy, vision, and architecture roadmap'],
          normalizedRequirements: ['Experience driving platform strategy'],
          sourceUrl: null,
        },
        baseline: {
          version: 1,
          sections: [
            {
              type: 'EXPERIENCE',
              content: 'Handled on-call rotations, incident response, patching, and runbooks.',
            },
          ],
        },
      }),
    );

    expect(result.dimensionScores.strategicTacticalFit).toBeLessThan(60);
  });

  it('reduces leadership level when leadership cues are missing in baseline', () => {
    const result = service.score(
      buildInput({
        job: {
          title: 'Engineering Lead',
          company: 'ExampleCo',
          rawDescription: 'Lead teams, mentor engineers, and manage stakeholders.',
          normalizedResponsibilities: ['Lead and mentor teams', 'Manage stakeholder expectations'],
          normalizedRequirements: ['Leadership experience required'],
          sourceUrl: null,
        },
        baseline: {
          version: 1,
          sections: [
            {
              type: 'EXPERIENCE',
              content: 'Individual contributor focused on coding tasks and tickets.',
            },
          ],
        },
      }),
    );

    expect(result.dimensionScores.leadershipLevel).toBeLessThan(60);
  });
});
