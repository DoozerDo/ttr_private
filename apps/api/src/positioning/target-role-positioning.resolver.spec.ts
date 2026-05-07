import { TargetRolePositioningResolver } from './target-role-positioning.resolver';

describe('TargetRolePositioningResolver', () => {
  it('prefers support/customer operations identity and suppresses frontend/contractor fragments', () => {
    const resolver = new TargetRolePositioningResolver();
    const output = resolver.resolve({
      job: {
        title: 'Director of Support Operations',
        company: 'ExampleCo',
        description: 'Own support operations, escalation governance, and cross-functional execution.',
      },
      resumeV2: {
        heading: { name: 'Test', contactLine: 'x' },
        summary: '',
        experience: [
          {
            company: 'Vue 3), deck builder frontend',
            roleTitle: 'Contractor',
            dateRange: '2022 - 2023',
            bullets: ['Built UI components.'],
          },
          {
            company: 'AMS DataSerfs',
            roleTitle: 'Linux System Administrator (Contractor)',
            dateRange: '2022 - 2024',
            bullets: ['Administered Linux infrastructure.'],
          },
          {
            company: 'Acme',
            roleTitle: 'Director of Support',
            dateRange: '2020 - 2024',
            bullets: [
              'Led support operations and improved incident response quality through repeatable playbooks.',
              'Partnered cross-functionally to reduce escalation friction and improve stakeholder updates.',
            ],
          },
        ],
      } as any,
    });

    expect(output.professionalIdentity.toLowerCase()).toContain('support operations');
    expect(output.prioritizedExperienceIds[0]).toBe('resume_v2_exp_2');
    expect(output.suppressedExperienceIds).toContain('resume_v2_exp_0');
    expect(output.suppressedExperienceIds).toContain('resume_v2_exp_1');
    expect(Object.keys(output.suppressionReasons).length).toBeGreaterThan(0);
  });
});

