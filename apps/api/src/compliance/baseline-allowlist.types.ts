export type BaselineAllowlistSnapshot = {
  allowedCompanies: string[];
  allowedRoles: string[];
  allowedTechnologies: string[];
  allowedMetricTokens: string[];
};

export const EMPTY_BASELINE_ALLOWLIST: BaselineAllowlistSnapshot = {
  allowedCompanies: [],
  allowedRoles: [],
  allowedTechnologies: [],
  allowedMetricTokens: [],
};
