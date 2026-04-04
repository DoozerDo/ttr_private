import { ComplianceFlagCode } from './compliance.types';

const FLAG_PRODUCER_TESTS: Record<ComplianceFlagCode, readonly string[]> = {
  [ComplianceFlagCode.SCOPE_INFLATION]: ['scope-inflation-detector.spec.ts'],
  [ComplianceFlagCode.MISSING_BASELINE_HASH]: ['compliance.service.spec.ts'],
  [ComplianceFlagCode.MISSING_BASELINE_VERSION]: ['compliance.service.spec.ts'],
  [ComplianceFlagCode.INVENTED_COMPANY]: ['compliance.service.spec.ts'],
  [ComplianceFlagCode.INVENTED_ROLE]: ['compliance.service.spec.ts'],
  [ComplianceFlagCode.INVENTED_METRIC]: ['compliance.service.spec.ts'],
  [ComplianceFlagCode.STYLIZED_PUNCTUATION]: ['compliance.service.spec.ts'],
  [ComplianceFlagCode.FICTIONAL_TECHNOLOGY]: [
    'baseline-version.service.spec.ts',
  ],
};

describe('Compliance flag producer coverage', () => {
  it('documents at least one producer test for every flag code', () => {
    const missing = Object.values(ComplianceFlagCode).filter(
      (code) => !FLAG_PRODUCER_TESTS[code]?.length,
    );

    expect(missing).toEqual([]);
  });
});
