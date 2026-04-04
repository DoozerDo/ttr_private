export enum ComplianceAction {
  FIT_SCORE = 'fit_score',
  RESUME_GENERATION = 'resume_gen',
  COVER_LETTER_GENERATION = 'cover_letter_gen',
  COVER_LETTER_EXPORT = 'cover_letter_export',
  FOLLOW_UP_GENERATION = 'follow_up_gen',
  BASELINE_PROMOTION = 'baseline_promotion',
  APPLICATION_EXPORT = 'application_export',
  RESUME_EXPORT = 'resume_export',
  JOB_TRACKER_CREATE = 'job_tracker_create',
  JOB_TRACKER_UPDATE = 'job_tracker_update',
  JOB_TRACKER_DELETE = 'job_tracker_delete',
  JOB_TRACKER_EXPORT = 'job_tracker_export',
}

export enum ComplianceFlagCode {
  SCOPE_INFLATION = 'scope_inflation',
  MISSING_BASELINE_HASH = 'missing_baseline_hash',
  MISSING_BASELINE_VERSION = 'missing_baseline_version',
  INVENTED_COMPANY = 'invented_company',
  INVENTED_ROLE = 'invented_role',
  INVENTED_METRIC = 'invented_metric',
  STYLIZED_PUNCTUATION = 'stylized_punctuation',
  FICTIONAL_TECHNOLOGY = 'fictional_technology',
}

export enum ComplianceFlagSeverity {
  BLOCK = 'block',
  WARN = 'warn',
}

export type ComplianceFlagLocationSection =
  | 'experience'
  | 'education'
  | 'summary';

export type ComplianceFlagLocation = {
  section: ComplianceFlagLocationSection;
  role?: string;
  index?: number;
};

export type ComplianceRuleTrace = {
  rule: string;
  reason: string;
  conditions?: string[];
};

export type ComplianceFlagType =
  | 'INVENTED_ROLE'
  | 'INVENTED_COMPANY'
  | 'SCOPE_INFLATION'
  | 'INVALID_ASSERTION'
  | 'INVENTED_METRIC'
  | 'FICTIONAL_TECHNOLOGY'
  | 'STYLIZED_PUNCTUATION'
  | 'MISSING_BASELINE_HASH'
  | 'MISSING_BASELINE_VERSION';

export enum GeneratedTextSourceType {
  BASELINE_EVIDENCE = 'BASELINE_EVIDENCE',
  JD_REFERENCE = 'JD_REFERENCE',
  CONNECTIVE_LANGUAGE = 'CONNECTIVE_LANGUAGE',
}

export type ComplianceFlag = {
  code: ComplianceFlagCode;
  severity: ComplianceFlagSeverity;
  message: string;
  type?: ComplianceFlagType;
  sourceText?: string;
  location?: ComplianceFlagLocation;
  rule?: string;
  reason?: string;
  conditions?: string[];
  confidence?: number;
  evidence?: Array<{
    baseline: string;
    generated: string;
    reason?: string;
    similarity?: number;
    generatedClaim?: {
      text: string;
      type: 'company' | 'technology' | 'concept' | 'derived' | 'operational_descriptor';
    };
  }>;
};

export type ComplianceDebugTraceLine = {
  sourceText: string;
  section: ComplianceFlagLocationSection;
  role?: string;
  index?: number;
  lineType?: string;
  rules: ComplianceRuleTrace[];
  flagged: boolean;
  flags?: ComplianceFlag[];
};

export type ComplianceDebugTrace = {
  enabled: boolean;
  appliedRules: ComplianceRuleTrace[];
  evaluatedLines: ComplianceDebugTraceLine[];
};

export type ComplianceTextSection = {
  title?: string | null;
  content?: string | null;
  sectionType?: string | null;
  sourceType?: GeneratedTextSourceType | null;
  sentenceSources?: Array<{
    text?: string | null;
    sourceType?: GeneratedTextSourceType | null;
  }>;
};

export enum DocumentType {
  COVER_LETTER = 'cover_letter',
  RESUME = 'resume',
  UNKNOWN = 'unknown',
}

export type JobApplicationContext = {
  allowedCompanies?: string[];
  allowedRoleTitles?: string[];
};
