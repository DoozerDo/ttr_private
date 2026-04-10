import { expectedStudioLabel } from './run-synthetic-loop-suite';

describe('synthetic loop studio label', () => {
  it('matches the canonical strong-fit studio CTA for the support ops scenario', () => {
    expect(expectedStudioLabel(87)).toBe('Generate Resume');
  });
});
