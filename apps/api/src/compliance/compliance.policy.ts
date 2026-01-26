import {
  ComplianceAction,
  ComplianceFlagCode,
  ComplianceFlagSeverity,
} from './compliance.types';

export type CompliancePolicyEntry = {
  severity: ComplianceFlagSeverity;
  blockConfidenceThreshold?: number;
};

const BASE_COMPLIANCE_POLICY: Record<
  ComplianceFlagCode,
  CompliancePolicyEntry
> = {
  [ComplianceFlagCode.SCOPE_INFLATION]: {
    severity: ComplianceFlagSeverity.WARN,
    blockConfidenceThreshold: 0.75,
  },
  [ComplianceFlagCode.MISSING_BASELINE_HASH]: {
    severity: ComplianceFlagSeverity.BLOCK,
  },
  [ComplianceFlagCode.MISSING_BASELINE_VERSION]: {
    severity: ComplianceFlagSeverity.BLOCK,
  },
  [ComplianceFlagCode.INVENTED_COMPANY]: {
    severity: ComplianceFlagSeverity.BLOCK,
  },
  [ComplianceFlagCode.INVENTED_ROLE]: {
    severity: ComplianceFlagSeverity.BLOCK,
  },
  [ComplianceFlagCode.INVENTED_METRIC]: {
    severity: ComplianceFlagSeverity.BLOCK,
  },
  [ComplianceFlagCode.STYLIZED_PUNCTUATION]: {
    severity: ComplianceFlagSeverity.BLOCK,
  },
  [ComplianceFlagCode.FICTIONAL_TECHNOLOGY]: {
    severity: ComplianceFlagSeverity.WARN,
    blockConfidenceThreshold: 0.85,
  },
};

const COMPLIANCE_ACTIONS = Object.values(
  ComplianceAction,
) as ComplianceAction[];

export const COMPLIANCE_POLICY_MAP: Record<
  ComplianceAction,
  Record<ComplianceFlagCode, CompliancePolicyEntry>
> = COMPLIANCE_ACTIONS.reduce(
  (acc, action) => {
    acc[action] = { ...BASE_COMPLIANCE_POLICY };
    return acc;
  },
  {} as Record<
    ComplianceAction,
    Record<ComplianceFlagCode, CompliancePolicyEntry>
  >,
);

export function resolveCompliancePolicy(
  action: ComplianceAction,
  code: ComplianceFlagCode,
): CompliancePolicyEntry | undefined {
  return COMPLIANCE_POLICY_MAP[action]?.[code];
}
