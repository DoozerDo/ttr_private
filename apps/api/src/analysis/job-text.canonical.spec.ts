import { canonicalizeJobText } from './job-text.canonical';

describe('canonicalizeJobText', () => {
  it('uses the trimmed raw description when present', () => {
    const result = canonicalizeJobText({
      rawDescription: '  Raw content ',
      normalizedResponsibilities: ['ignored'],
      normalizedRequirements: ['ignored'],
    });

    expect(result.jobTextUsed).toBe('Raw content');
    expect(result.jobTextCharCount).toBe(result.jobTextUsed.length);
  });

  it('falls back to normalized segments when raw description is empty', () => {
    const result = canonicalizeJobText({
      rawDescription: '',
      normalizedResponsibilities: ['foo responsibility'],
      normalizedRequirements: ['bar requirement'],
    });

    expect(result.jobTextUsed).toBe('foo responsibility\nbar requirement');
    expect(result.jobTextCharCount).toBe(result.jobTextUsed.length);
  });

  it('throws when no text is supplied', () => {
    expect(() =>
      canonicalizeJobText({
        rawDescription: ' ',
        normalizedResponsibilities: [],
        normalizedRequirements: [],
      }),
    ).toThrow('Job description text is required for scoring.');
  });
});
