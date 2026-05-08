import { PositioningPlanService } from './positioning-plan.service';

describe('PositioningPlanService', () => {
  it('support/customer operations role: suppresses Vue/deck-builder fragments and emphasizes ops roles', () => {
    const service = new PositioningPlanService();
    const plan = service.buildPlan({
      job: {
        title: 'Support Operations Manager',
        company: 'ExampleCo',
        description: 'Own escalation management, SLA governance, triage workflow, and cross-functional operating rhythm.',
      },
      resumeV2: {
        heading: { name: 'Test Candidate', contactLine: '' },
        summary: 'Support leader with verified impact.',
        experience: [
          { company: 'Vue 3), deck builder frontend', roleTitle: 'Contractor', bullets: ['Built a deck builder frontend.'] },
          {
            company: 'Acme Corp',
            roleTitle: 'Customer Operations Manager',
            bullets: [
              'Owned escalation workflow and incident triage; improved SLA adherence through clearer routing and playbooks.',
              'Partnered cross-functionally to reduce repeat escalations via RCA and weekly operating reviews.',
            ],
          },
        ],
        education: [],
        competencies: [],
      } as any,
    });

    expect(plan.targetRoleFamily).toBe('support_operations');
    expect(plan.suppressRoleIds).toContain('resume_v2_exp_0');
    expect(plan.emphasizeRoleIds[0]).toBe('resume_v2_exp_1');
    expect(plan.topEvidenceThemes.join(' ')).toMatch(/escalation|process|cross-functional/i);
  });

  it('infrastructure-heavy role: allows infrastructure evidence to rise', () => {
    const service = new PositioningPlanService();
    const plan = service.buildPlan({
      job: {
        title: 'Infrastructure Engineering Lead',
        company: 'InfraCo',
        description: 'Own AWS, Terraform, Kubernetes and reliability improvements.',
      },
      resumeV2: {
        heading: { name: 'Test Candidate', contactLine: '' },
        summary: 'Operations leader.',
        experience: [
          {
            company: 'InfraCo',
            roleTitle: 'Systems Engineer',
            bullets: [
              'Built infrastructure automation using Terraform and AWS.',
              'Improved reliability by hardening deployments and monitoring.',
            ],
          },
          {
            company: 'Acme Corp',
            roleTitle: 'Customer Operations Manager',
            bullets: [
              'Owned escalation workflow and incident triage.',
              'Partnered cross-functionally to reduce repeat escalations.',
            ],
          },
        ],
        education: [],
      } as any,
    });

    expect(plan.targetRoleFamily).toBe('infrastructure_heavy');
    expect(plan.emphasizeRoleIds[0]).toBe('resume_v2_exp_0');
    expect(plan.topEvidenceThemes.join(' ')).toMatch(/infrastructure|reliability|deployment|incident/i);
  });

  it('thesis and summary strategy are explainable and derived from evidence/themes', () => {
    const service = new PositioningPlanService();
    const plan = service.buildPlan({
      job: {
        title: 'Customer Operations Manager',
        company: 'ExampleCo',
        description: 'Cross-functional execution, escalations, process improvements.',
      },
      resumeV2: {
        heading: { name: 'Test Candidate', contactLine: '' },
        summary: '',
        experience: [
          {
            company: 'Acme Corp',
            roleTitle: 'Customer Operations Manager',
            bullets: [
              'Owned escalation workflow and incident triage; improved SLA adherence through clearer routing and playbooks.',
              'Built reporting and dashboards to improve response time and throughput.',
            ],
          },
        ],
        education: [],
      } as any,
    });

    expect(plan.positioningThesis.toLowerCase()).toMatch(/operations/);
    expect(plan.summaryStrategy).toMatch(/operations_first|customer_first|leadership_first/);
    expect(plan.topEvidenceThemes.length).toBeGreaterThan(0);
  });
});

