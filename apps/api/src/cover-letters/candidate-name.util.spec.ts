import {
  DEFAULT_SYNTHETIC_CANDIDATE_NAME,
  isValidCandidateName,
  resolveSyntheticCandidateName,
} from './candidate-name.util';

describe('candidate-name.util', () => {
  it('rejects sentence-like values ending with punctuation', () => {
    expect(
      resolveSyntheticCandidateName(
        'Support Operations leader focused on measurable delivery and reliable execution.',
      ),
    ).toBe(DEFAULT_SYNTHETIC_CANDIDATE_NAME);
  });

  it('rejects role-phrase strings even without punctuation', () => {
    expect(
      resolveSyntheticCandidateName(
        'Support Operations leader focused on measurable delivery and reliable execution',
      ),
    ).toBe(DEFAULT_SYNTHETIC_CANDIDATE_NAME);
  });

  it('accepts person-name-shaped values', () => {
    expect(isValidCandidateName('Jane Doe')).toBe(true);
    expect(resolveSyntheticCandidateName('Jane Doe')).toBe('Jane Doe');
  });

  it('falls back when empty', () => {
    expect(resolveSyntheticCandidateName('')).toBe(DEFAULT_SYNTHETIC_CANDIDATE_NAME);
  });
});

