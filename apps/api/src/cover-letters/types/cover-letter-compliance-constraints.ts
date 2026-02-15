export interface CoverLetterComplianceConstraints {
  mode?: 'strict';
  disallowPhrases?: string[];
  disallowRoleTitles?: string[];
  allowedCompanyNames?: string[];
  allowedRoleTitles?: string[];
  baselineCompanyNames?: string[];
  jobCompanyNames?: string[];
  notes?: string;
}
