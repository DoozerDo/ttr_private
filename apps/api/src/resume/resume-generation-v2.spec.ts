import { buildDeterministicResumeV2FromBaseline } from './resume-generation-v2';
import { sanitizeResumePreviewForStudio } from './resumePreviewSanitizer';

describe('resume generation v2', () => {
  it('ranks structured baseline experience by job relevance (prefers support leadership over contractor fragments)', () => {
    const baselineSections = [
      {
        sectionType: 'SUMMARY',
        content: 'Support leader with verified impact across incident response and operations.',
      },
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Vue 3), deck builder frontend | Contractor | 2022 - 2023',
          '- Built UI components.',
          '',
          'Acme | Director of Support | 2020 - 2024',
          '- Led support operations and improved incident response quality through repeatable playbooks.',
          '- Partnered cross-functionally to reduce escalation friction and improve stakeholder updates.',
        ].join('\n'),
      },
    ] as any[];

    const result = buildDeterministicResumeV2FromBaseline({
      baselineSections: baselineSections as any,
      identity: { name: 'Test User', contactLine: 'test@example.com' },
      job: { title: 'Director of Support', company: 'ExampleCo', description: 'Own support operations and incident response.' },
    });

    const preview = sanitizeResumePreviewForStudio(result.normalized);
    const companies = (preview.experience ?? []).map((e) => String((e as any)?.company ?? ''));
    expect(companies[0]).toBe('Acme');
    expect(companies.join('|')).not.toContain('Vue 3), deck builder frontend');
    expect(String((result.normalized as any).summary ?? '').split(/(?<=[.!?])\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(2);
    const firstRoleBullets = (preview.experience?.[0] as any)?.bullets ?? [];
    expect(firstRoleBullets.length).toBeGreaterThanOrEqual(2);
    const totalBullets = (preview.experience ?? []).flatMap((e: any) => e?.bullets ?? []).length;
    expect(totalBullets).toBeGreaterThanOrEqual(3);
    // No fragment-only bullets (very short) in the composed draft.
    expect((preview.experience ?? []).flatMap((e: any) => e?.bullets ?? []).some((b: any) => String(b ?? '').trim().length < 12)).toBe(false);
  });

  it('enforces PositioningPlan role order as the sole render authority when job indicates support operations', () => {
    const baselineSections = [
      {
        sectionType: 'SUMMARY',
        content: 'Support leader with verified impact across incident response and operations.',
      },
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Vue 3), deck builder frontend | Contractor | 2022 - 2023',
          '- Built UI components.',
          '',
          'Acme | Director of Support | 2020 - 2024',
          '- Led support operations and improved incident response quality through repeatable playbooks.',
          '- Partnered cross-functionally to reduce escalation friction and improve stakeholder updates.',
          '',
          'Beta Systems | Support Operations Lead | 2018 - 2020',
          '- Owned escalation workflow and SLA governance across teams.',
          '- Built operating reviews and queue triage playbooks.',
        ].join('\n'),
      },
    ] as any[];

    const result = buildDeterministicResumeV2FromBaseline({
      baselineSections: baselineSections as any,
      identity: { name: 'Test User', contactLine: 'test@example.com' },
      job: { title: 'Support Operations Manager', company: 'ExampleCo', description: 'Own escalations, SLA governance, and playbooks.' },
    });

    const preview = sanitizeResumePreviewForStudio(result.normalized);
    const companies = (preview.experience ?? []).map((e) => String((e as any)?.company ?? ''));
    // Vue fragment must not render when stronger roles exist.
    expect(companies.join('|')).not.toContain('Vue 3), deck builder frontend');
    // Must lead with an ops/support role (Acme or Beta) rather than the fragment.
    expect(companies[0]).toMatch(/Acme|Beta Systems/);
  });

  it('includes detailed normalized model validation failures when validation rejects the model', () => {
    const baselineSections = [
      {
        sectionType: 'SUMMARY',
        content: 'Support leader.',
      },
      {
        sectionType: 'EXPERIENCE',
        content: [
          'AMS DataSerfs | Senior Data Analyst | 2021 - Present',
          '- Built KPI dashboards.',
        ].join('\n'),
      },
    ] as any[];

    try {
      buildDeterministicResumeV2FromBaseline({
        baselineSections: baselineSections as any,
        // Duplicate token should trigger normalized validation failure (contactLine dedupe).
        identity: { name: 'Dalen Example', contactLine: 'dalen@example.com | dalen@example.com' },
        job: null,
      });
      throw new Error('Expected V2 normalized validation to fail');
    } catch (error) {
      const payload =
        (error as any)?.response ??
        (typeof (error as any)?.getResponse === 'function'
          ? (error as any).getResponse()
          : null);
      expect(payload?.error?.code).toBe('resume_v2_normalized_model_invalid');
      expect(Array.isArray(payload?.error?.details?.reasons)).toBe(true);
      expect(Array.isArray(payload?.error?.details?.failures)).toBe(true);
      expect(payload.error.details.failures.some((f: any) => f?.path === 'heading.contactLine')).toBe(true);
      expect(
        payload.error.details.failures.some(
          (f: any) =>
            typeof f?.path === 'string' &&
            typeof f?.field === 'string' &&
            'message' in f &&
            'value' in f,
        ),
      ).toBe(true);
    }
  });

  it('produces clean Studio preview experience entries (preserves AMS DataSerfs)', () => {
    const baselineSections = [
      {
        sectionType: 'SUMMARY',
        content: 'Support leader with 10+ years in B2B SaaS.',
      },
      {
        sectionType: 'EXPERIENCE',
        content: [
          'AMS DataSerfs | Senior Data Analyst | 2021 - Present',
          '- Built KPI dashboards and improved reporting cadence.',
          '- Automated weekly exports and reduced manual effort.',
        ].join('\n'),
      },
      {
        sectionType: 'SKILLS',
        content: ['- SQL', '- Excel', '- Looker'].join('\n'),
      },
    ] as any[];

    const result = buildDeterministicResumeV2FromBaseline({
      baselineSections: baselineSections as any,
      identity: { name: 'Test User', contactLine: 'test@example.com' },
      job: null,
    });

    const preview = sanitizeResumePreviewForStudio(result.normalized);
    expect(Array.isArray(preview.experience)).toBe(true);
    expect(preview.experience.length).toBeGreaterThan(0);
    expect(preview.experience[0]?.company).toBe('AMS DataSerfs');
    expect(preview.experience[0]?.roleTitle).toBe('Senior Data Analyst');

    for (const entry of preview.experience) {
      expect(String(entry.company ?? '')).not.toContain('Vue 3), deck builder frontend');
      expect(String(entry.roleTitle ?? '')).not.toBe('Professional Experience');
    }
  });

  it('produces a grounded non-empty summary and excludes known garbage experience entries', () => {
    const baselineSections = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'AMS DataSerfs | Senior Data Analyst | 2021 - Present',
          '- Built KPI dashboards and improved reporting cadence.',
          '',
          'Experience entry needs correction | Professional Experience',
          '- Vue 3), deck builder frontend',
          '',
          'OfficeDepot October 2014 - November 2016 | Cashier',
          '- Assisted customers.',
        ].join('\n'),
      },
    ] as any[];

    const result = buildDeterministicResumeV2FromBaseline({
      baselineSections: baselineSections as any,
      identity: { name: 'Test User', contactLine: 'test@example.com' },
      job: null,
    });

    expect(String((result.normalized as any).summary ?? '').trim().length).toBeGreaterThan(0);
    expect(JSON.stringify(result.normalized.experience)).not.toContain('Vue 3), deck builder frontend');
    expect(JSON.stringify(result.normalized.experience)).not.toContain('Experience entry needs correction');
    expect(JSON.stringify(result.normalized.experience)).not.toContain('Professional Experience');
  });

  it('builds fallback summary as readable sentences (no stitched tech-list run-ons)', () => {
    const baselineSections = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Acme | Director of Support | 2020 - 2024',
          '- Owned support operations across Zendesk, Salesforce, Jira, Confluence, Slack, Datadog, and PagerDuty while improving reliability and escalations.',
          '- Led cross-functional operating reviews and clarified ownership, metrics, and decision cadence across teams.',
        ].join('\n'),
      },
    ] as any[];

    const result = buildDeterministicResumeV2FromBaseline({
      baselineSections: baselineSections as any,
      identity: { name: 'Test User', contactLine: 'test@example.com' },
      job: { title: 'Director of Support', company: 'ExampleCo', description: 'Own support operations and escalation workflows.' },
    });

    const summary = String((result.normalized as any).summary ?? '').trim();
    const sentences = summary.split(/(?<=[.!?])\s+/).filter(Boolean);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    // First sentence should not be a comma-heavy tech stuffing run-on.
    const firstCommaCount = (sentences[0]?.match(/,/g) ?? []).length;
    expect(firstCommaCount).toBeLessThanOrEqual(3);
    // Ensure the two source bullets were not glued into one unpunctuated line.
    expect(summary).toContain('.');
  });

  it('rejects malformed fragments such as "Vue 3), deck builder frontend" with explicit reasons', () => {
    const baselineSections = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'Vue 3), deck builder frontend | Project',
          '- Implemented state management.',
        ].join('\n'),
      },
    ] as any[];

    try {
      buildDeterministicResumeV2FromBaseline({
        baselineSections: baselineSections as any,
        identity: { name: 'Test User', contactLine: 'test@example.com' },
        job: null,
      });
      throw new Error('Expected V2 to reject malformed experience fragments');
    } catch (error) {
      const payload =
        (error as any)?.response ??
        (typeof (error as any)?.getResponse === 'function'
          ? (error as any).getResponse()
          : null);
      expect(payload?.error?.code).toBe('baseline_template_not_ready');
      expect(Array.isArray(payload?.error?.details?.rejected)).toBe(true);
      expect(payload.error.details.rejected.join(',')).toContain('company_candidate:company:unmatched_closing_paren');
      expect(payload.error.details.rejected.join(',')).toContain('company_candidate:company:project_fragment_terms');
    }
  });

  it('rejects malformed fragments such as "React frontend builder" with explicit reasons', () => {
    const baselineSections = [
      {
        sectionType: 'EXPERIENCE',
        content: [
          'React frontend builder | Project',
          '- Built UI components.',
        ].join('\n'),
      },
    ] as any[];

    try {
      buildDeterministicResumeV2FromBaseline({
        baselineSections: baselineSections as any,
        identity: { name: 'Test User', contactLine: 'test@example.com' },
        job: null,
      });
      throw new Error('Expected V2 to reject malformed experience fragments');
    } catch (error) {
      const payload =
        (error as any)?.response ??
        (typeof (error as any)?.getResponse === 'function'
          ? (error as any).getResponse()
          : null);
      expect(payload?.error?.code).toBe('baseline_template_not_ready');
      expect(Array.isArray(payload?.error?.details?.rejected)).toBe(true);
      expect(payload.error.details.rejected.join(',')).toContain('company_candidate:company:project_fragment_terms');
    }
  });

  it('exposes quality gate failure details with path/field/value and fixes trailing fragments', () => {
    const baselineSections = [
      {
        sectionType: 'SUMMARY',
        content: 'Support leader with 10+ years in B2B SaaS.',
      },
      {
        sectionType: 'EXPERIENCE',
        content: [
          'AMS DataSerfs | Senior Data Analyst | 2021 - Present',
          // Trailing fragment that should be cleaned by V2 before quality gate.
          '- Built a production platform for a game. The',
          '- Led incident response and reliability work across teams.',
        ].join('\n'),
      },
    ] as any[];

    const result = buildDeterministicResumeV2FromBaseline({
      baselineSections: baselineSections as any,
      identity: { name: 'Test User', contactLine: 'test@example.com' },
      job: null,
    });

    expect(['pass', 'needs_refinement']).toContain(result.qualityGate.status);
    const bullets = result.normalized.experience?.[0]?.bullets ?? [];
    expect(bullets.some((b) => /\bThe\s*$/.test(String(b)))).toBe(false);
  });

  it('returns needs_refinement quality gate (non-fatal) when strict quality checks fail', () => {
    const baselineSections = [
      {
        sectionType: 'SUMMARY',
        content: 'Support leader with 10+ years in B2B SaaS.',
      },
      {
        sectionType: 'EXPERIENCE',
        content: [
          'AMS DataSerfs | Senior Data Analyst | 2021 - Present',
          // Placeholder token should trigger strict quality gate (placeholder detection) and yield detailed failures.
          '- Insert company.',
        ].join('\n'),
      },
    ] as any[];

    const result = buildDeterministicResumeV2FromBaseline({
      baselineSections: baselineSections as any,
      identity: { name: 'Test User', contactLine: 'test@example.com' },
      job: null,
    });

    expect(result.qualityGate.status).toBe('needs_refinement');
    expect(result.qualityGate.reasons ?? []).toContain('placeholder:Insert');
  });

  it('does not block generation when experience bullets are missing (marks needs_refinement if needed)', () => {
    const baselineSections = [
      {
        sectionType: 'SUMMARY',
        content: 'Hybrid engineer with software and infrastructure experience.',
      },
      {
        sectionType: 'SKILLS',
        content: ['Python, Docker, Kubernetes'].join('\n'),
      },
      {
        sectionType: 'EXPERIENCE',
        content: [
          'AMS DataSerfs, Inc. | Linux System Administrator | 2022 - 2024',
          // Paragraph-style responsibilities (no bullet prefix) should be treated as usable evidence.
          'Managed Linux systems, VMs, DNS, and VPN connectivity.',
          'Biblioso | Infrastructure Engineer | 2023 - 2024',
          'Maintained Kubernetes workloads and CI/CD.',
        ].join('\n'),
      },
    ] as any[];

    const result = buildDeterministicResumeV2FromBaseline({
      baselineSections: baselineSections as any,
      identity: { name: 'Test User', contactLine: 'test@example.com' },
      job: null,
    });

    expect(Array.isArray(result.normalized.experience)).toBe(true);
    expect(result.normalized.experience.length).toBeGreaterThan(0);
    expect(['pass', 'needs_refinement']).toContain(result.qualityGate.status);
  });
});
