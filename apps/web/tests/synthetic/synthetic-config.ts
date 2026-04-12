export const syntheticBaseURL = (process.env.BASE_URL || "http://127.0.0.1:3100").replace(/\/+$/, "");
export const syntheticApiBaseURL = (process.env.API_BASE_URL || "http://127.0.0.1:3001").replace(/\/+$/, "");

export const syntheticUserEmail =
  process.env.SYNTHETIC_USER_EMAIL?.trim() || "synthetic-core-loop@targetthisrole.local";
export const syntheticUserPassword =
  process.env.SYNTHETIC_USER_PASSWORD?.trim() || "SyntheticUserPass!123";

export const syntheticSignupPassword =
  process.env.SYNTHETIC_BETA_SIGNUP_PASSWORD?.trim() || syntheticUserPassword;
export const syntheticSignupEmailPrefix =
  process.env.SYNTHETIC_BETA_SIGNUP_EMAIL_PREFIX?.trim() || "synthetic-landing";
export const syntheticLoginEmailPrefix =
  process.env.SYNTHETIC_LOGIN_EMAIL_PREFIX?.trim() || "synthetic-login";
export const landingPublicJourneysSuiteKey = "landing-public-journeys";
export const passwordResetPublicJourneysSuiteKey = "password-reset-public-journeys";
export const syntheticPasswordResetEmail =
  process.env.SYNTHETIC_PASSWORD_RESET_EMAIL?.trim() || "";
export const syntheticPasswordResetEmailPrefix =
  process.env.SYNTHETIC_PASSWORD_RESET_EMAIL_PREFIX?.trim() || "synthetic-password-reset";
export const syntheticPasswordResetCurrentPassword =
  process.env.SYNTHETIC_PASSWORD_RESET_CURRENT_PASSWORD?.trim() ||
  process.env.SYNTHETIC_USER_PASSWORD?.trim() ||
  "SyntheticResetPass!123";
export const syntheticPasswordResetNewPassword =
  process.env.SYNTHETIC_PASSWORD_RESET_NEW_PASSWORD?.trim() || "SyntheticResetPass!456";
export const syntheticIngestToken =
  process.env.SYNTHETIC_INGEST_TOKEN?.trim() || "synthetic-ingest-local";

export function buildSyntheticSignupEmail() {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${syntheticSignupEmailPrefix}+${uniqueSuffix}@targetthisrole.local`;
}

export function buildSyntheticLoginEmail() {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${syntheticLoginEmailPrefix}+${uniqueSuffix}@targetthisrole.local`;
}

export function buildSyntheticPasswordResetEmail() {
  if (syntheticPasswordResetEmail) {
    return syntheticPasswordResetEmail;
  }

  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${syntheticPasswordResetEmailPrefix}+${uniqueSuffix}@targetthisrole.local`;
}

export function logSyntheticStep(
  step: string,
  details?: Record<string, unknown>,
  suite = landingPublicJourneysSuiteKey,
) {
  console.log(
    JSON.stringify({
      suite,
      step,
      timestamp: new Date().toISOString(),
      ...(details ?? {}),
    }),
  );
}
