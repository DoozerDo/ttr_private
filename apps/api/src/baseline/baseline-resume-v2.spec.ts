import { UnprocessableEntityException } from '@nestjs/common';
import { buildValidatedResumeV2FromParsedBaseline } from './baseline-resume-v2';
import { validateNormalizedResumeDocument } from '../resume/resume-normalization';

describe('buildValidatedResumeV2FromParsedBaseline', () => {
  it('builds a valid ResumeV2 with populated experience', () => {
    const parsedBaseline: Record<string, unknown> = {
      baseline_id: 'baseline-1',
      identity: { full_name: 'Test Person', location: 'Test City' },
      experience: [
        {
          company: 'Acme',
          role: 'Engineer',
          start_date: '2020',
          end_date: 'present',
          details_text: 'Shipped features\nImproved ticket resolution time by 25%',
        },
      ],
    };

    const resumeV2 = buildValidatedResumeV2FromParsedBaseline(parsedBaseline);
    expect(Array.isArray((resumeV2 as any).experience)).toBe(true);
    expect((resumeV2 as any).experience.length).toBeGreaterThan(0);
    const validation = validateNormalizedResumeDocument(resumeV2 as any);
    expect(validation.valid).toBe(true);
  });

  it('accepts alternate parser field shapes (employer/jobTitle/highlights) and produces usable experience', () => {
    const parsedBaseline: Record<string, unknown> = {
      baseline_id: 'baseline-alt-1',
      identity: { full_name: 'Alt Person', location: 'Alt City' },
      work_history: [
        {
          employer: 'Globex',
          jobTitle: 'Support Operations Lead',
          startDate: '2019-01',
          endDate: '2022-12',
          highlights: ['Built a QA program', 'Reduced escalation backlog by 30%'],
        },
      ],
    };

    // Integration proof: this path must not fail with any of the known user-facing readiness/gating codes.
    // `buildValidatedResumeV2FromParsedBaseline` internally runs the ResumeV2 deterministic builder, which would
    // throw `baseline_template_not_ready` if structured extraction/filtering produced zero valid experience entries.
    expect(() => buildValidatedResumeV2FromParsedBaseline(parsedBaseline)).not.toThrow();
    const resumeV2 = buildValidatedResumeV2FromParsedBaseline(parsedBaseline);
    expect(Array.isArray((resumeV2 as any).experience)).toBe(true);
    expect((resumeV2 as any).experience.length).toBeGreaterThan(0);
    expect(validateNormalizedResumeDocument(resumeV2 as any).valid).toBe(true);
  });

  it('accepts nested field shapes (company.name, roleTitle.value) and does not drop usable experience entries', () => {
    const parsedBaseline: Record<string, unknown> = {
      baseline_id: 'baseline-nested-1',
      identity: { full_name: 'Nested Person', location: 'Nested City' },
      experience: [
        {
          company: { name: 'NestedCo' },
          roleTitle: { value: 'Customer Operations Manager' },
          startDate: '2021-01',
          endDate: '2024-02',
          highlights: ['Owned escalation process', 'Built dashboards for queue health'],
        },
      ],
    };

    const resumeV2 = buildValidatedResumeV2FromParsedBaseline(parsedBaseline);
    expect(Array.isArray((resumeV2 as any).experience)).toBe(true);
    expect((resumeV2 as any).experience.length).toBeGreaterThan(0);
    expect(validateNormalizedResumeDocument(resumeV2 as any).valid).toBe(true);
  });

  it('does not fail with baseline_resume_v2_ingestion_failed when baseline sections contain usable structured experience identities even if parsed experience headers are malformed', () => {
    const parsedBaseline: Record<string, unknown> = {
      baseline_id: 'baseline-prod-1',
      identity: { full_name: 'Prod Person', location: 'Seattle, WA' },
      experience: [
        // Malformed parser mapping: location collapsed into company; roleTitle contains "Role – Company".
        {
          company: 'Seattle',
          role_title: 'Senior Manager, Customer Operations – SentinelOne',
          start_date: 'Dec 2022',
          end_date: 'Aug 2025',
          details_text: 'Owned incident operations',
        },
      ],
    };

    const baselineSections: any[] = [
      {
        id: 'exp',
        baselineId: 'baseline-prod-1',
        sectionType: 'EXPERIENCE',
        title: 'Experience',
        order: 0,
        includePolicy: 'ALWAYS',
        content: [
          'Senior Manager, Customer Operations – SentinelOne',
          'Remote Dec 2022 – Aug 2025',
          '- Owned incident operations and escalation handling.',
          '',
          'Senior Manager, Technology Operations Excellence – Starbucks',
          'Seattle, WA Dec 2018 – Oct 2019',
          '- Improved operational workflows and reliability.',
          '',
          'Director, Customer Success – iStreamPlanet (Warner Bros. Discovery)',
          'United States 2006 – 2013',
          '- Led customer success programs and cross-functional execution.',
          '',
          'Director, Cloud Development and Support – CenturyLink Business for Enterprise',
          'Seattle, WA Dec 2014 – Oct 2018',
          '- Improved invoice dispute handling and revenue reconciliation accuracy.',
        ].join('\n'),
      },
    ];

    const resumeV2 = buildValidatedResumeV2FromParsedBaseline(parsedBaseline, baselineSections);
    expect(Array.isArray((resumeV2 as any).experience)).toBe(true);
    const companies = ((resumeV2 as any).experience as any[]).map((e) => String(e?.company ?? '')).join(' | ');
    expect(companies).toMatch(/SentinelOne/);
    expect(companies).toMatch(/Starbucks/);
    expect(companies).toMatch(/iStreamPlanet/);
    expect(companies).toMatch(/CenturyLink Business for Enterprise/);
    // Guard: location must not become the company when structured entries exist (the string "Seattle, WA" may appear in date ranges).
    expect(((resumeV2 as any).experience as any[]).map((e) => String(e?.company ?? '')).join(' | ')).not.toContain('Seattle');
    expect(validateNormalizedResumeDocument(resumeV2 as any).valid).toBe(true);
  });

  it('throws a clear ingestion failure when experience is missing/empty', () => {
    const parsedBaseline: Record<string, unknown> = {
      baseline_id: 'baseline-1',
      identity: { full_name: 'Test Person', location: 'Test City' },
      experience: [],
    };

    expect(() => buildValidatedResumeV2FromParsedBaseline(parsedBaseline)).toThrow(
      UnprocessableEntityException,
    );
    try {
      buildValidatedResumeV2FromParsedBaseline(parsedBaseline);
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      const body = (error as UnprocessableEntityException).getResponse() as any;
      expect(String(body?.error?.code ?? '')).toBe('baseline_resume_v2_ingestion_failed');
      expect(String(body?.error?.message ?? '')).toMatch(/did not produce any usable experience entries/i);
      expect(String(body?.error?.details?.hint ?? '')).toMatch(/schema/i);
    }
  });

  it('still fails with an actionable error when parser output has no experience/work_history', () => {
    const parsedBaseline: Record<string, unknown> = {
      baseline_id: 'baseline-empty-1',
      identity: { full_name: 'Empty Person', location: 'Empty City' },
      // no experience/work_history keys
    };

    try {
      buildValidatedResumeV2FromParsedBaseline(parsedBaseline);
      throw new Error('Expected ingestion to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      const body = (error as UnprocessableEntityException).getResponse() as any;
      expect(String(body?.error?.code ?? '')).toBe('baseline_resume_v2_ingestion_failed');
      expect(String(body?.error?.message ?? '')).toMatch(/did not produce any usable experience entries/i);
      expect(String(body?.error?.details?.hint ?? '')).toMatch(/resume parser returned empty work history/i);
    }
  });

  it('does not fail Resume V2 ingestion when some structured experience entries have weak/empty bullet evidence (uses surviving structured identities)', () => {
    const parsedBaseline: Record<string, unknown> = {
      baseline_id: 'baseline-bullets-empty-1',
      identity: { full_name: 'Empty Bullets', location: 'Remote' },
      experience: [{ company: 'Seattle', role_title: 'Role – Company', details_text: '' }],
    };

    const baselineSections: any[] = [
      {
        id: 'exp',
        baselineId: 'baseline-bullets-empty-1',
        sectionType: 'EXPERIENCE',
        title: 'Experience',
        order: 0,
        includePolicy: 'ALWAYS',
        content: [
          // SentinelOne identity present but weak bullet corpus.
          'Senior Manager, Customer Operations – SentinelOne',
          'Remote Dec 2022 – Aug 2025',
          '',
          // CenturyLink has verified bullet evidence so ingestion remains valid.
          'Director, Cloud Development and Support – CenturyLink Business for Enterprise',
          'Seattle, WA Dec 2018 – Oct 2019',
          '- Improved invoice dispute handling through workflow alignment.',
        ].join('\n'),
      },
    ];

    const resumeV2 = buildValidatedResumeV2FromParsedBaseline(parsedBaseline, baselineSections);
    expect(Array.isArray((resumeV2 as any).experience)).toBe(true);
    expect(((resumeV2 as any).experience as any[]).length).toBeGreaterThan(0);
    expect(((resumeV2 as any).experience as any[]).map((e) => String(e?.company ?? ''))).toEqual(
      expect.arrayContaining(['CenturyLink Business for Enterprise']),
    );
  });
});
