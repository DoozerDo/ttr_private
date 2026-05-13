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
});
