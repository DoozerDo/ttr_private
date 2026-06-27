import type { FitAssessment } from '../analysis/fit-assessment.entity';
import type { Baseline } from '../baseline/baseline.entity';
import type { BaselineVersion } from '../baseline/baseline-version.entity';
import type { Job } from '../jobs/job.entity';
import type { GenerationEvidenceBundle } from './generation-evidence-resolver';
import { WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR } from '@shared/workflowThresholds';

export type GenerationEligibilityWarningCode =
  | 'baseline_template_not_ready'
  | 'readiness_error'
  | 'baseline_resume_v2_ingestion_failed'
  | 'resume_v2_missing'
  | 'resume_v2_invalid'
  | 'unsupported_target_requirements';

export type GenerationEligibilityHardBlockerCode =
  | 'missing_baseline'
  | 'missing_baseline_version'
  | 'missing_target_role'
  | 'readiness_below_threshold'
  | 'missing_compatibility_score'
  | 'compatibility_below_threshold'
  | 'hard_compliance_blocker'
  | 'no_verified_work_history_evidence';

export type GenerationEligibilityDecision = {
  eligible: boolean;
  warnings: Array<{ code: GenerationEligibilityWarningCode; message: string; details?: Record<string, unknown> }>;
  omittedUnsupportedRequirements: string[];
  hardBlocker: null | { code: GenerationEligibilityHardBlockerCode; message: string; details?: Record<string, unknown> };
};

function normalizeRequirement(value: string): string {
  return String(value ?? '').trim();
}

function containsLoose(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  return Boolean(n) && h.includes(n);
}

export function decideGenerationEligibility(params: {
  baseline: Baseline | null;
  baselineVersion: BaselineVersion | null;
  job: Job | null;
  readinessScore: number | null;
  assessment: FitAssessment | null;
  complianceBlocked: boolean;
  evidence: GenerationEvidenceBundle | null;
  targetRequirements?: string[] | null;
  warningCodes?: GenerationEligibilityWarningCode[];
}): GenerationEligibilityDecision {
  const warnings: GenerationEligibilityDecision['warnings'] = [];
  const addWarning = (code: GenerationEligibilityWarningCode, message: string, details?: Record<string, unknown>) => {
    warnings.push({ code, message, ...(details ? { details } : {}) });
  };

  if (!params.baseline) {
    return {
      eligible: false,
      warnings,
      omittedUnsupportedRequirements: [],
      hardBlocker: { code: 'missing_baseline', message: 'Baseline is missing.' },
    };
  }
  if (!params.baselineVersion) {
    return {
      eligible: false,
      warnings,
      omittedUnsupportedRequirements: [],
      hardBlocker: { code: 'missing_baseline_version', message: 'Baseline version is missing.' },
    };
  }
  if (!params.job) {
    return {
      eligible: false,
      warnings,
      omittedUnsupportedRequirements: [],
      hardBlocker: { code: 'missing_target_role', message: 'Job or target role context is missing.' },
    };
  }
  if (params.complianceBlocked) {
    return {
      eligible: false,
      warnings,
      omittedUnsupportedRequirements: [],
      hardBlocker: { code: 'hard_compliance_blocker', message: 'Hard compliance blocker present.' },
    };
  }

  const readinessScore = params.readinessScore;
  if (typeof readinessScore === 'number' && readinessScore < 80) {
    return {
      eligible: false,
      warnings,
      omittedUnsupportedRequirements: [],
      hardBlocker: { code: 'readiness_below_threshold', message: 'Baseline readiness is below 80.', details: { readinessScore } },
    };
  }

  const score = params.assessment?.overallScore ?? null;
  if (typeof score !== 'number') {
    return {
      eligible: false,
      warnings,
      omittedUnsupportedRequirements: [],
      hardBlocker: {
        code: 'missing_compatibility_score',
        message: 'Compatibility score is missing.',
      },
    };
  }
  if (score < WORKFLOW_DIRECT_STUDIO_SCORE_FLOOR) {
    return {
      eligible: false,
      warnings,
      omittedUnsupportedRequirements: [],
      hardBlocker: {
        code: 'compatibility_below_threshold',
        message: 'Compatibility score is below 80.',
        details: { overallScore: score },
      },
    };
  }

  const evidence = params.evidence;
  if (!evidence?.usableWorkHistoryEvidence) {
    return {
      eligible: false,
      warnings,
      omittedUnsupportedRequirements: [],
      hardBlocker: {
        code: 'no_verified_work_history_evidence',
        message: 'No usable verified work history evidence exists for document generation.',
      },
    };
  }

  const warningCodes = new Set(params.warningCodes ?? []);
  warningCodes.forEach((code) => addWarning(code, code));

  // Propagate Resume V2 warnings as recoverable warnings.
  for (const warning of evidence.warnings ?? []) {
    if (warning.code === 'resume_v2_missing') addWarning('resume_v2_missing', warning.message, warning.details);
    if (warning.code === 'resume_v2_invalid') addWarning('resume_v2_invalid', warning.message, warning.details);
  }

  // Unsupported target requirements are omitted; warn but never hard block.
  const requirements = (params.targetRequirements ?? []).map(normalizeRequirement).filter(Boolean);
  const evidenceText = [evidence.resumePlainText, ...evidence.workHistory.flatMap((item) => [item.company, item.roleTitle, ...(item.bullets ?? [])])]
    .filter(Boolean)
    .join(' ');

  const omittedUnsupportedRequirements = requirements.filter((req) => !containsLoose(evidenceText, req));
  if (omittedUnsupportedRequirements.length) {
    addWarning('unsupported_target_requirements', 'Unsupported target requirements were omitted from generation output.', {
      omitted: omittedUnsupportedRequirements,
    });
  }

  return {
    eligible: true,
    warnings,
    omittedUnsupportedRequirements,
    hardBlocker: null,
  };
}
