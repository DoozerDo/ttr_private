import { describe, expect, it } from '@jest/globals';
import { isPublicRequest } from './public-routes';

describe('public routes', () => {
  it('treats preview compatibility-score as public (no prefix)', () => {
    expect(
      isPublicRequest({
        method: 'POST',
        url: '/preview/compatibility-score',
      }),
    ).toBe(true);
  });

  it('treats preview extract-resume-text as public', () => {
    expect(
      isPublicRequest({
        method: 'POST',
        url: '/preview/extract-resume-text',
      }),
    ).toBe(true);
  });

  it('treats preview canonical-fit-score as public', () => {
    expect(
      isPublicRequest({
        method: 'POST',
        url: '/preview/canonical-fit-score',
      }),
    ).toBe(true);
  });

  it('treats preview compatibility-score as public when mounted under /api', () => {
    expect(
      isPublicRequest({
        method: 'POST',
        originalUrl: '/api/preview/compatibility-score',
      }),
    ).toBe(true);
  });

  it('treats preview compatibility-score as public with query string', () => {
    expect(
      isPublicRequest({
        method: 'POST',
        originalUrl: '/api/preview/compatibility-score?foo=bar',
      }),
    ).toBe(true);
  });

  it('does not mark unrelated routes as public', () => {
    expect(
      isPublicRequest({
        method: 'GET',
        url: '/baselines',
      }),
    ).toBe(false);
  });
});
