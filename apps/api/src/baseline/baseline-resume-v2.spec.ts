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
    }
  });
});

