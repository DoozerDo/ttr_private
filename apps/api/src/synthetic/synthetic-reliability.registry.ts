export type SyntheticReliabilitySuiteRegistryEntry = {
  suiteKey: string;
  suiteName: string;
  surface: string;
  category: string;
  journeySummary: string;
  active: boolean;
  validatedJourneys: string[];
  dependencies: string[];
  envInputs: string[];
  sourceRefs: string[];
  artifactRefs: string[];
};

export const SYNTHETIC_RELIABILITY_SUITE_REGISTRY: SyntheticReliabilitySuiteRegistryEntry[] = [
  {
    suiteKey: 'landing-public-journeys',
    suiteName: 'Landing / Auth Synthetic',
    surface: 'Public landing + auth',
    category: 'Public conversion',
    journeySummary:
      'Landing render, resume upload, job description validation, beta signup, login, and post-login continuity.',
    active: true,
    validatedJourneys: [
      'Landing page renders with hero, analysis block, trust strip, and radar teaser',
      'Resume upload accepts a valid PDF or DOCX',
      'Job description input enables analysis only when validation is satisfied',
      'Beta signup reaches the intended confirmation or gated state',
      'Login routes through the intended authenticated handoff',
      'Post-login continuity reaches the app destination from landing',
    ],
    dependencies: [
      'Public landing route',
      'Resume upload endpoint',
      'Auth session cookie',
      'Beta signup flow',
      'Login flow',
    ],
    envInputs: [
      'BASE_URL',
      'API_BASE_URL',
      'SYNTHETIC_USER_PASSWORD',
      'SYNTHETIC_BETA_SIGNUP_PASSWORD',
      'SYNTHETIC_BETA_SIGNUP_EMAIL_PREFIX',
      'SYNTHETIC_LOGIN_EMAIL_PREFIX',
    ],
    sourceRefs: [
      'apps/web/tests/synthetic/landing-journeys.spec.ts',
      'apps/web/tests/synthetic/synthetic-config.ts',
      '.github/workflows/synthetic-landing.yml',
    ],
    artifactRefs: [
      'apps/web/tests/fixtures/public-landing/synthetic-resume.pdf',
      'apps/web/tests/fixtures/public-landing/synthetic-job-description.txt',
    ],
  },
  {
    suiteKey: 'password-reset-public-journeys',
    suiteName: 'Password Reset Synthetic',
    surface: 'Public auth + recovery',
    category: 'Authentication recovery',
    journeySummary:
      'Reset request initiation, reset link retrieval, password replacement, login with the new password, old password rejection, and reset-link reuse rejection.',
    active: true,
    validatedJourneys: [
      'Reset request is accepted',
      'Reset link is retrievable from the synthetic token store',
      'Reset link opens and accepts a new password',
      'New password logs in successfully',
      'Old password is rejected',
      'Reused reset link fails cleanly',
    ],
    dependencies: [
      'Public login route',
      'Forgot password flow',
      'Reset password flow',
      'Synthetic token-link helper',
      'Authenticated landing handoff',
    ],
    envInputs: [
      'BASE_URL',
      'API_BASE_URL',
      'SYNTHETIC_INGEST_TOKEN',
      'SYNTHETIC_PASSWORD_RESET_EMAIL',
      'SYNTHETIC_PASSWORD_RESET_EMAIL_PREFIX',
      'SYNTHETIC_PASSWORD_RESET_CURRENT_PASSWORD',
      'SYNTHETIC_PASSWORD_RESET_NEW_PASSWORD',
    ],
    sourceRefs: [
      'apps/web/tests/synthetic/password-reset-journeys.spec.ts',
      'apps/web/tests/synthetic/password-reset-synthetic-reliability-publisher.ts',
      'apps/web/tests/synthetic/synthetic-config.ts',
      'apps/api/src/synthetic/synthetic-user-token-link.service.ts',
      'apps/web/app/api/admin/synthetics/user-token-link/route.ts',
      '.github/workflows/synthetic-landing.yml',
    ],
    artifactRefs: [],
  },
];

export function listSyntheticReliabilitySuites(): SyntheticReliabilitySuiteRegistryEntry[] {
  return SYNTHETIC_RELIABILITY_SUITE_REGISTRY;
}
