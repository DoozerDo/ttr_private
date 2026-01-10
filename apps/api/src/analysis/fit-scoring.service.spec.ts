import { BadRequestException } from '@nestjs/common';
import { FitScoringService } from './fit-scoring.service';

const baseSentence =
  'Lead strategic SaaS operations teams, coach stakeholders, and embed enterprise security processes.';
const repeatedText = (text: string, times: number) => Array(times).fill(text).join(' ');

const buildInput = (overrides?: Partial<Parameters<FitScoringService['score']>[0]>) => ({
  job: {
    title: 'Senior Platform Leader',
    company: 'ExampleCo',
    rawDescription: repeatedText(baseSentence, 30),
    normalizedResponsibilities: [repeatedText(baseSentence, 25)],
    normalizedRequirements: [repeatedText('Experience with AWS, Kubernetes, Terraform, ServiceNow, and Snowflake.', 20)],
    sourceUrl: 'https://example.com/jobs/leadership',
  },
  baseline: {
    version: 2,
    sections: [
      {
        type: 'EXPERIENCE',
        content:
          'Led global PMO and security teams, defined roadmaps, and scaled cross-functional leaders across SaaS operations.',
      },
      {
        type: 'SKILLS',
        content: 'AWS, Kubernetes, Terraform, ServiceNow, Snowflake, Jira, incident response',
      },
    ],
  },
  ...overrides,
});

describe('FitScoringService', () => {
  const service = new FitScoringService();

  it('returns the new summary and theme-based strengths', async () => {
    const result = await service.score(buildInput());
    expect(result.summary).toContain('Weighted fit based on leadership');
    expect(result.strengths).toContain('leadership');
    expect(result.gaps).toEqual(expect.any(Array));
    expect(result.dimensionScores.experienceAlignment).toBeGreaterThanOrEqual(0);
  });

  it('includes the debug payload when requested', async () => {
    const result = await service.score(buildInput(), undefined, { debug: true });
    expect(result.debug).toBeDefined();
    expect(result.debug?.weights).toBeDefined();
    expect(result.debug?.finalScore).toBeDefined();
  });

  it('rejects job text that is too short for scoring', async () => {
    await expect(
      service.score({
        job: {
          title: 'Short JD',
          company: 'ExampleCo',
          rawDescription: 'Too short',
          normalizedResponsibilities: [],
          normalizedRequirements: [],
          sourceUrl: null,
        },
        baseline: {
          version: 1,
          sections: [
            {
              type: 'EXPERIENCE',
              content: 'Short baseline content.',
            },
          ],
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('increases the expanded score when additions are provided', async () => {
    const base = await service.score(buildInput());
    const withAdditions = await service.score(
      buildInput({
        verifiedAdditions: ['Deep AWS and Kubernetes delivery experience'],
      }),
    );
    expect(withAdditions.expandedScore).toBeGreaterThanOrEqual(withAdditions.originalScore);
    expect(withAdditions.appliedAdditions).toEqual(['Deep AWS and Kubernetes delivery experience']);
  });
});
