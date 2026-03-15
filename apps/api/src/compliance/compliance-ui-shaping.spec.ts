import {
  ComplianceFlagCode,
  ComplianceFlagSeverity,
  type ComplianceFlag,
} from './compliance.types';
import { shapeComplianceForUi } from './compliance-ui-shaping';

describe('shapeComplianceForUi', () => {
  it('maps scope inflation to ui-safe language and hides raw reason tokens', () => {
    const flags: ComplianceFlag[] = [
      {
        code: ComplianceFlagCode.SCOPE_INFLATION,
        severity: ComplianceFlagSeverity.BLOCK,
        message: 'Potential scope inflation exceeds baseline scope.',
        evidence: [
          {
            baseline: 'Baseline has no matching scope evidence.',
            generated: 'Led global support organization across regions.',
            reason: 'extreme_scale_without_baseline_match',
          } as any,
          {
            baseline: 'Baseline has no matching scope evidence.',
            generated: 'Directed enterprise-wide support operations.',
            reason: 'extreme_scale_without_baseline_match',
          } as any,
        ] as any,
      },
    ];

    const shaped = shapeComplianceForUi(flags);

    expect(shaped.reasons[0]).toContain(
      'broader leadership scope than your baseline clearly supports',
    );
    expect(shaped.reasons[0]).not.toContain('extreme_scale_without_baseline_match');
    expect(shaped.diagnostics[0]?.rawReasons).toContain(
      'extreme_scale_without_baseline_match',
    );
  });

  it('maps invented role warnings to ui-safe explanation', () => {
    const flags: ComplianceFlag[] = [
      {
        code: ComplianceFlagCode.INVENTED_ROLE,
        severity: ComplianceFlagSeverity.BLOCK,
        message: 'Role not found in baseline.',
        evidence: [
          {
            baseline: 'Support Operations Manager',
            generated: 'Served as Senior Network Infrastructure Engineer.',
          },
        ],
      },
    ];

    const shaped = shapeComplianceForUi(flags);
    expect(shaped.reasons[0]).toContain(
      'role or title claims could not be verified against your baseline',
    );
    expect(shaped.reasons[0]).not.toContain('Role not found in baseline');
  });

  it('collapses duplicate scope evidence into one ui reason', () => {
    const flags: ComplianceFlag[] = [
      {
        code: ComplianceFlagCode.SCOPE_INFLATION,
        severity: ComplianceFlagSeverity.WARN,
        message: 'Potential scope inflation cues need review against baseline.',
        evidence: [
          {
            baseline: 'Baseline has no matching scope evidence.',
            generated: 'Led department operations.',
            reason: 'no_semantic_support',
          } as any,
        ] as any,
      },
      {
        code: ComplianceFlagCode.SCOPE_INFLATION,
        severity: ComplianceFlagSeverity.WARN,
        message: 'Potential scope inflation cues need review against baseline.',
        evidence: [
          {
            baseline: 'Baseline has no matching scope evidence.',
            generated: 'Managed cross functional operations.',
            reason: 'no_semantic_support',
          } as any,
        ] as any,
      },
    ];

    const shaped = shapeComplianceForUi(flags);
    expect(shaped.reasons).toHaveLength(1);
    expect(shaped.diagnostics).toHaveLength(2);
  });
});
