import { BadRequestException } from '@nestjs/common';
import { buildJobTextForScoring } from './analysis.service';

describe('buildJobTextForScoring', () => {
  it('prefers the raw description when present and keeps the source raw', () => {
    const jobInput = {
      rawDescription: '  Lead SaaS operations and strategy across APAC.  ',
      normalizedResponsibilities: ['Lead strategy', 'Mentor leaders'],
      normalizedRequirements: ['10+ years experience', 'AWS expertise'],
    };

    const result = buildJobTextForScoring(jobInput);

    expect(result.jobTextSource).toBe('raw');
    expect(result.jobText).toBe(
      'Lead SaaS operations and strategy across APAC.',
    );
    expect(result.jobText).not.toContain('SUPPLEMENTAL RESPONSIBILITIES');
    expect(result.jobText).not.toContain('SUPPLEMENTAL REQUIREMENTS');
  });

  it('falls back to normalized sections when no raw text exists', () => {
    const jobInput = {
      rawDescription: '',
      normalizedResponsibilities: ['Manage ops', 'Own escalations'],
      normalizedRequirements: ['5 years in SaaS', 'Security clearance'],
    };

    const result = buildJobTextForScoring(jobInput);

    expect(result.jobTextSource).toBe('normalized_fallback');
    expect(result.jobText).toContain('SUPPLEMENTAL RESPONSIBILITIES');
    expect(result.jobText).toContain('SUPPLEMENTAL REQUIREMENTS');
    expect(result.jobRawTextCharCount).toBe(0);
  });

  it('flags short raw text with a warning', () => {
    const jobInput = {
      rawDescription: 'Some short text.',
      normalizedResponsibilities: [],
      normalizedRequirements: [],
    };

    const result = buildJobTextForScoring(jobInput);

    expect(result.jobTextSource).toBe('raw');
    expect(result.jobRawTextTooShort).toBe(true);
    expect(result.jobRawTextWarning).toMatch(/Raw job description is only/);
  });

  it('rejects calls without any job text', () => {
    expect(() => buildJobTextForScoring({})).toThrow(BadRequestException);
  });
});
