import { buildJobPromptText } from './fit-score.utils';

describe('buildJobPromptText', () => {
  it('starts with the authoritative raw description and appends labeled supplemental sections', () => {
    const job = {
      rawDescription:
        'Lead the customer experience org across SaaS operations.',
      normalizedResponsibilities: ['Lead strategy', 'Mentor teams'],
      normalizedRequirements: ['10+ years experience', 'AWS expertise'],
    };

    const result = buildJobPromptText(job);

    expect(result.source).toBe('rawDescription');
    expect(result.text.startsWith('FULL JOB DESCRIPTION (AUTHORITATIVE)')).toBe(
      true,
    );
    expect(result.text).toContain('SUPPLEMENTAL RESPONSIBILITIES');
    expect(result.text).toContain('SUPPLEMENTAL REQUIREMENTS');
    expect(
      result.text.indexOf('SUPPLEMENTAL RESPONSIBILITIES'),
    ).toBeGreaterThan(
      result.text.indexOf('FULL JOB DESCRIPTION (AUTHORITATIVE)'),
    );
    expect(result.text.indexOf('SUPPLEMENTAL REQUIREMENTS')).toBeGreaterThan(
      result.text.indexOf('SUPPLEMENTAL RESPONSIBILITIES'),
    );
  });

  it('falls back to normalized text when no raw description is provided', () => {
    const job = {
      rawDescription: '',
      normalizedResponsibilities: ['Own operations'],
      normalizedRequirements: ['5 years in SaaS'],
    };

    const result = buildJobPromptText(job);

    expect(result.source).toBe('normalizedSections');
    expect(result.text).toContain('SUPPLEMENTAL RESPONSIBILITIES');
    expect(result.text).toContain('SUPPLEMENTAL REQUIREMENTS');
    expect(result.text.startsWith('FULL JOB DESCRIPTION (AUTHORITATIVE)')).toBe(
      false,
    );
  });
});
