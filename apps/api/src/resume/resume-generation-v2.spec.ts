import { buildDeterministicResumeV2FromBaseline } from './resume-generation-v2';
import { sanitizeResumePreviewForStudio } from './resumePreviewSanitizer';

describe('resume generation v2', () => {
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
    });

    expect(String((result.normalized as any).summary ?? '').trim().length).toBeGreaterThan(0);
    expect(JSON.stringify(result.normalized.experience)).not.toContain('Vue 3), deck builder frontend');
    expect(JSON.stringify(result.normalized.experience)).not.toContain('Experience entry needs correction');
    expect(JSON.stringify(result.normalized.experience)).not.toContain('Professional Experience');
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
      });
      throw new Error('Expected V2 to reject malformed experience fragments');
    } catch (error) {
      const payload =
        (error as any)?.response ??
        (typeof (error as any)?.getResponse === 'function'
          ? (error as any).getResponse()
          : null);
      expect(payload?.error?.code).toBe('resume_v2_invalid_experience_fragments');
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
      });
      throw new Error('Expected V2 to reject malformed experience fragments');
    } catch (error) {
      const payload =
        (error as any)?.response ??
        (typeof (error as any)?.getResponse === 'function'
          ? (error as any).getResponse()
          : null);
      expect(payload?.error?.code).toBe('resume_v2_invalid_experience_fragments');
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
    });

    expect(result.qualityGate.status).toBe('pass');
    const bullets = result.normalized.experience?.[0]?.bullets ?? [];
    expect(bullets.some((b) => /\bThe\s*$/.test(String(b)))).toBe(false);
  });

  it('includes detailed quality gate failures when strict validation rejects the model', () => {
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

    try {
      buildDeterministicResumeV2FromBaseline({
        baselineSections: baselineSections as any,
        identity: { name: 'Test User', contactLine: 'test@example.com' },
      });
      throw new Error('Expected V2 to fail');
    } catch (error) {
      const payload =
        (error as any)?.response ??
        (typeof (error as any)?.getResponse === 'function'
          ? (error as any).getResponse()
          : null);
      expect(payload?.error?.code).toBe('resume_v2_quality_gate_failed');
      expect(Array.isArray(payload?.error?.details?.reasons)).toBe(true);
      expect(Array.isArray(payload?.error?.details?.failures)).toBe(true);
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
});
