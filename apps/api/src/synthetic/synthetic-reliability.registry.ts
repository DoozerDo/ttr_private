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
];

export function listSyntheticReliabilitySuites(): SyntheticReliabilitySuiteRegistryEntry[] {
  return SYNTHETIC_RELIABILITY_SUITE_REGISTRY;
}
