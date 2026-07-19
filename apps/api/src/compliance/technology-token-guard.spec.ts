import { isObviouslyInvalidTechnologyToken } from './technology-token-guard';

describe('technology-token-guard', () => {
  it.each([
    '206-949-1418',
    '2022',
    '2025',
    '500',
    '000',
    '2013',
    'client-impacting',
    'billing-impacting',
    'self-service',
    'multi-system',
    '2018Support',
    'alex@example.com',
    'https://example.com/profile',
    'www.example.com/about',
    'example.com/profile',
  ])('marks "%s" as invalid technology token', (token) => {
    expect(isObviouslyInvalidTechnologyToken(token)).toBe(true);
  });

  it.each(['Salesforce', 'Five9', 'ServiceNow', 'Kubernetes', 'NetSuite'])(
    'does not mark "%s" as invalid technology token',
    (token) => {
      expect(isObviouslyInvalidTechnologyToken(token)).toBe(false);
    },
  );
});

