export enum ComplianceAction {
  FIT_SCORE = 'fit_score',
  RESUME_GENERATION = 'resume_gen',
  COVER_LETTER_GENERATION = 'cover_letter_gen',
  APPLICATION_EXPORT = 'application_export',
  RESUME_EXPORT = 'resume_export',
}

export enum ComplianceFlagCode {
  SCOPE_INFLATION = 'scope_inflation',
  MISSING_BASELINE_HASH = 'missing_baseline_hash',
  UNKNOWN_COMPANY = 'unknown_company',
  INVENTED_COMPANY = 'invented_company',
  INVENTED_ROLE = 'invented_role',
  INVENTED_METRIC = 'invented_metric',
  STYLIZED_PUNCTUATION = 'stylized_punctuation',
}

export enum ComplianceFlagSeverity {
  BLOCK = 'block',
}

export type ComplianceFlag = {
  code: ComplianceFlagCode;
  severity: ComplianceFlagSeverity;
  message: string;
};
