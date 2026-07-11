import { UnprocessableEntityException } from '@nestjs/common';
import { assembleResumeFromStructuredBaseline, buildAuthoritativeResumeDraftFromResumeV2 } from './resumeTemplateAssembler';
import { buildAuthoritativeRenderPlan } from '../positioning/authoritative-render-plan';

describe('buildAuthoritativeResumeDraftFromResumeV2', () => {
  it('ignores ResumeV2 ordering and excludes weak fragment roles when stronger evidence exists', () => {
    const resumeV2 = {
      heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
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
            'Led support operations and improved incident response quality through repeatable playbooks',
            'Partnered cross-functionally to reduce escalation friction and improve stakeholder updates',
          ],
        },
      ],
    } as any;

    const draft = buildAuthoritativeResumeDraftFromResumeV2({
      resumeV2,
      identity: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
      renderPlan: buildAuthoritativeRenderPlan({
        positioningPlan: null,
        orderedFallbackRoleIds: ['resume_v2_exp_2', 'resume_v2_exp_1', 'resume_v2_exp_0'],
        suppressedFallbackRoleIds: ['resume_v2_exp_0', 'resume_v2_exp_1'],
        allowedEvidenceSnippetIds: null,
      }),
      professionalIdentity: 'Support Operations / Customer Operations leader',
      targetNarrative:
        'Operational leadership focused on scalable support systems, cross-functional execution, and escalation/root-cause rhythms.',
    });

    const companies = (draft.experience ?? []).map((e: any) => String(e?.company ?? ''));
    expect(companies[0]).toBe('Acme');
    expect(JSON.stringify(draft.experience ?? [])).not.toContain('Vue 3), deck builder frontend');
    expect(JSON.stringify(draft.experience ?? [])).not.toContain('AMS DataSerfs');

    expect(String(draft.summary ?? '')).toBe('');

    const firstBullets = (draft.experience?.[0] as any)?.bullets ?? [];
    expect(firstBullets.length).toBeGreaterThanOrEqual(2);
  });

  it('renders exclusively from positioningPlan.emphasizeRoleIds (exact order) and never renders suppressed roles', () => {
    const resumeV2 = {
      heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
      summary: 'Old summary.',
      experience: [
        {
          company: 'Vue 3), deck builder frontend',
          roleTitle: 'Contractor',
          dateRange: '2022 - 2023',
          bullets: ['Built UI components.'],
        },
        {
          company: 'Acme Corp',
          roleTitle: 'Customer Operations Manager',
          dateRange: '2020 - 2022',
          bullets: ['Owned escalation workflow and incident triage.', 'Improved SLA adherence through routing and playbooks.'],
        },
        {
          company: 'Beta Systems',
          roleTitle: 'Support Operations Lead',
          dateRange: '2022 - 2024',
          bullets: ['Led incident triage and queue management.', 'Built operating reviews and playbooks for stakeholders.'],
        },
      ],
    } as any;

    const draft = buildAuthoritativeResumeDraftFromResumeV2({
      resumeV2,
      identity: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
      renderPlan: buildAuthoritativeRenderPlan({
        positioningPlan: {
          emphasizeRoleIds: ['resume_v2_exp_2', 'resume_v2_exp_1'],
          suppressRoleIds: ['resume_v2_exp_0'],
          positioningThesis:
            'Experienced support operations leader focused on escalation management and operational process improvement.',
          summaryStrategy: 'operations_first',
          topEvidenceThemes: ['escalation management', 'operational process improvement'],
        } as any,
        orderedFallbackRoleIds: ['resume_v2_exp_0', 'resume_v2_exp_1', 'resume_v2_exp_2'],
        suppressedFallbackRoleIds: [],
        allowedEvidenceSnippetIds: null,
      }),
    } as any);

    const companies = (draft.experience ?? []).map((e: any) => String(e?.company ?? ''));
    expect(companies).toEqual(['Beta Systems', 'Acme Corp']);
    expect(JSON.stringify(draft.experience ?? [])).not.toContain('Vue 3), deck builder frontend');
    expect(String(draft.summary ?? '')).toMatch(/support operations|operations leader|escalation/i);
  });

  it('does not resurrect filtered experience when a strict canonical plan suppresses the only ranked candidate', () => {
    const resumeV2 = {
      heading: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
      summary: 'Old summary.',
      experience: [
        {
          company: 'Acme Corp',
          roleTitle: 'Customer Operations Manager',
          dateRange: '2020 - 2022',
          bullets: ['Owned escalation workflow and incident triage.', 'Improved SLA adherence through routing and playbooks.'],
        },
        {
          company: 'Beta Systems',
          roleTitle: 'Support Operations Lead',
          dateRange: '2022 - 2024',
          bullets: ['Led incident triage and queue management.', 'Built operating reviews and playbooks for stakeholders.'],
        },
      ],
    } as any;

    const draft = buildAuthoritativeResumeDraftFromResumeV2({
      resumeV2,
      identity: { name: 'Alex Candidate', contactLine: 'alex@example.com' },
      renderPlan: buildAuthoritativeRenderPlan({
        positioningPlan: {
          suppressRoleIds: ['resume_v2_exp_1'],
        } as any,
        orderedFallbackRoleIds: ['resume_v2_exp_1'],
        suppressedFallbackRoleIds: [],
        allowedEvidenceSnippetIds: null,
      }),
    } as any);

    expect(draft.experience).toHaveLength(0);
    expect(JSON.stringify(draft.experience ?? [])).not.toContain('Beta Systems');
  });

  it('uses structured baseline identity when supplied for canonical drafting', () => {
    const resumeV2 = {
      heading: { name: 'Prod Person', contactLine: 'prod@example.com' },
      summary: 'Old summary.',
      experience: [
        {
          company: 'SentinelOne',
          roleTitle: 'Senior Manager, Customer Operations',
          dateRange: 'Dec 2022 - Aug 2025',
          bullets: ['Owned incident operations and escalation handling.', 'Built reporting cadence for escalations.'],
        },
        {
          company: 'iStreamPlanet',
          roleTitle: 'Director, Customer Success',
          dateRange: 'United States 2006 - 2013',
          bullets: ['Led customer success programs.'],
        },
      ],
    } as any;

    const structuredBaselineForIdentity = {
      experience: [
        {
          company: 'Seattle',
          roleTitle: 'Senior Manager, Customer Operations - SentinelOne',
          dates: 'Remote Dec 2018 - Oct 2019',
          bullets: ['Owned incident operations and escalation handling.'],
        },
        {
          company: 'Summary',
          roleTitle: 'Professional Experience',
          dates: '2020 - 2024',
          bullets: ['Contact: prod@example.com | Seattle, WA'],
        },
        {
          company: 'iStreamPlanet (Warner Bros. Discovery)',
          roleTitle: 'Director, Customer Success',
          dates: 'United States 2006 - 2013',
          bullets: ['Led customer success programs.'],
        },
      ],
    } as any;

    const draft = buildAuthoritativeResumeDraftFromResumeV2({
      resumeV2,
      identity: { name: 'Prod Person', contactLine: 'prod@example.com' },
      renderPlan: buildAuthoritativeRenderPlan({
        positioningPlan: null,
        orderedFallbackRoleIds: [],
        suppressedFallbackRoleIds: [],
        allowedEvidenceSnippetIds: null,
      }),
      structuredBaselineForIdentity,
    });

    const top = (draft.experience ?? [])[0] as any;
    expect(String(top.company)).toBe('Seattle');
    expect(String(top.roleTitle)).toMatch(/Senior Manager, Customer Operations/i);
    expect(String(top.roleTitle)).toMatch(/SentinelOne/i);
    expect(String(top.dateRange ?? '')).toMatch(/Remote Dec 2018/i);

    const iStream = (draft.experience ?? []).find((e: any) => String(e?.company ?? '').includes('iStreamPlanet')) as any;
    expect(String(iStream?.dateRange ?? '')).toMatch(/2006/i);
    expect(String(iStream?.dateRange ?? '')).toMatch(/2013/i);
  });

  it('preserves all truthfully structured experience groups through assembly and final ResumeV2 drafting', () => {
    const structuredBaseline = {
      summary: 'Service Delivery and Operations leader with verified baseline experience.',
      skills: ['Zendesk', 'Jira', 'Salesforce Service Cloud'],
      education: [],
      missingEvidenceReasons: [],
      experience: [
        {
          company: 'SentinelOne',
          roleTitle: 'Senior Manager, Customer Operations',
          dates: 'Dec 2022 – Aug 2025',
          bullets: [
            'Owned global incident and escalation management for Customer Operations supporting Fortune 500 clients.',
            'Led distributed operations team managing two thousand plus monthly cases with 98 percent SLA adherence.',
          ],
        },
        {
          company: 'Starbucks',
          roleTitle: 'Senior Manager, Technology Operations Excellence',
          dates: 'Apr 2020 – Mar 2022',
          bullets: [
            'Directed the Technology Operations Excellence program spanning 30,000 plus retail and corporate locations.',
            'Designed SLA frameworks, KPI dashboards, and automation models guiding enterprise level decision making.',
          ],
        },
        {
          company: 'iStreamPlanet (Warner Bros. Discovery)',
          roleTitle: 'Director, Customer Success',
          dates: 'Dec 2018 – Oct 2019',
          bullets: [
            'Directed SaaS service delivery and customer success operations for enterprise media clients.',
            'Implemented RCA and escalation frameworks improving reliability and client satisfaction.',
          ],
        },
        {
          company: 'CenturyLink Business for Enterprise',
          roleTitle: 'Director, Cloud Development and Support',
          dates: 'Dec 2013 – Dec 2018',
          bullets: [
            'Led support and development teams across NA, EMEA, and APAC while managing enterprise cloud and infrastructure services.',
            'Instituted SLA reporting, KPI tracking, and RCA driven governance reducing chronic escalations.',
          ],
        },
        {
          company: 'Microsoft',
          roleTitle: 'Support Engineer',
          dates: '2006 – 2013',
          bullets: [
            'Directed incident and change operations for Office 365 sustaining 99.99 percent uptime.',
            'Created training guides for operational execution and incident practices.',
          ],
        },
      ],
    } as any;

    const identity = { name: 'Test Candidate', contactLine: 'test@example.com' };
    const assembled = assembleResumeFromStructuredBaseline(structuredBaseline, identity);
    expect(assembled.experience).toHaveLength(5);
    expect((assembled.experience ?? []).map((e: any) => String(e.company ?? ''))).toEqual(
      expect.arrayContaining([
        'SentinelOne',
        'Starbucks',
        'iStreamPlanet (Warner Bros. Discovery)',
        'CenturyLink Business for Enterprise',
        'Microsoft',
      ]),
    );
    expect(JSON.stringify(assembled.experience ?? [])).not.toContain('Vue 3), deck builder frontend');

    const draft = buildAuthoritativeResumeDraftFromResumeV2({
      resumeV2: assembled,
      identity,
      renderPlan: buildAuthoritativeRenderPlan({
        positioningPlan: null,
        orderedFallbackRoleIds: [],
        suppressedFallbackRoleIds: [],
        allowedEvidenceSnippetIds: null,
      }),
      professionalIdentity: 'Support Operations leader',
      targetNarrative: 'Operational leadership focused on escalations and service quality.',
    });

    expect(draft.experience).toHaveLength(5);
    expect(JSON.stringify(draft.experience ?? [])).not.toContain('Vue 3), deck builder frontend');
  });

  it('fails closed when authoritative ResumeV2 experience is missing or invalid', () => {
    const resumeV2 = {
      heading: { name: 'Prod Person', contactLine: 'prod@example.com' },
      summary: 'Role-targeted summary.',
      experience: [],
    } as any;

    try {
      buildAuthoritativeResumeDraftFromResumeV2({
        resumeV2,
        identity: { name: 'Prod Person', contactLine: 'prod@example.com' },
        renderPlan: buildAuthoritativeRenderPlan({
          positioningPlan: null,
          orderedFallbackRoleIds: [],
          suppressedFallbackRoleIds: [],
          allowedEvidenceSnippetIds: null,
        }),
        structuredBaselineForIdentity: {
          experience: [
            {
              company: 'SentinelOne',
              roleTitle: 'Senior Manager, Customer Operations',
              dates: 'Dec 2022 - Aug 2025',
              bullets: ['Owned incident operations and escalation handling.'],
            },
          ],
        } as any,
      });
      throw new Error('Expected authoritative ResumeV2 validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      const payload =
        (error as any)?.response ??
        (typeof (error as any)?.getResponse === 'function' ? (error as any).getResponse() : null);
      expect(payload?.error?.code).toBe('resume_v2_normalized_model_invalid');
      expect(String(payload?.error?.message ?? '')).toContain('ResumeV2 produced an invalid normalized resume model');
    }
  });
});
