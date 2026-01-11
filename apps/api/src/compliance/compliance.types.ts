export enum ComplianceAction {
  FIT_SCORE = 'fit_score',
  RESUME_GENERATION = 'resume_gen',
  COVER_LETTER_GENERATION = 'cover_letter_gen',
  FOLLOW_UP_GENERATION = 'follow_up_gen',
  BASELINE_PROMOTION = 'baseline_promotion',
  APPLICATION_EXPORT = 'application_export',
  RESUME_EXPORT = 'resume_export',
}

export enum ComplianceFlagCode {
  SCOPE_INFLATION = 'scope_inflation',
  MISSING_BASELINE_HASH = 'missing_baseline_hash',
  MISSING_BASELINE_VERSION = 'missing_baseline_version',
  UNKNOWN_COMPANY = 'unknown_company',
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

export type ComplianceFlag = {
  code: ComplianceFlagCode;
  severity: ComplianceFlagSeverity;
  message: string;
  evidence?: Array<{ baseline: string; generated: string }>;
};

export type ComplianceTextSection = {
  title?: string | null;
  content?: string | null;
  sectionType?: string | null;
};
