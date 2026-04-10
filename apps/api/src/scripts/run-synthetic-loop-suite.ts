import { randomUUID } from 'node:crypto';
import { buildDocumentStrategyPlan } from '../shared/documentStrategyPlan';
import { DEFAULT_COVER_LETTER_CLOSING_TEMPLATE_KEY } from '../cover-letters/closing-templates';
import { listSyntheticGenerationScenarioBundles } from '../synthetic/generation/synthetic-generation.fixtures';
import { buildSyntheticLoopJobDescription } from './synthetic-loop-job-description';
import {
  SYNTHETIC_LOOP_BASELINE_FILENAME,
  loadSyntheticLoopBaselineFixture,
} from './synthetic-loop-fixture';

type JsonRecord = Record<string, unknown>;

const ROOT_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const API_URL = (process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');
const SYNTHETIC_EMAIL =
  process.env.SYNTHETIC_USER_EMAIL || 'synthetic-core-loop@targetthisrole.local';
const SYNTHETIC_PASSWORD =
  process.env.SYNTHETIC_USER_PASSWORD || 'SyntheticUserPass!123';
const SYNTHETIC_SCENARIO = (process.env.SYNTHETIC_LOOP_SCENARIO || '').trim();
const SYNTHETIC_LOGIN_EMAILS = Array.from(
  new Set([
    ...(process.env.FOUNDER_EMAILS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    'michaeltalbert@hotmail.com',
    'liveverify-founder@example.com',
    'founder@targetthisrole.com',
    SYNTHETIC_EMAIL,
  ]),
).filter(Boolean);
const RUN_ID = randomUUID();
let browserPromise: Promise<any> | null = null;

function log(event: string, details: JsonRecord = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...details,
    }),
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function readBody(response: Response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as JsonRecord;
  } catch {
    return { raw: text };
  }
}

type BaselineListRow = {
  id: string;
  originalFilename?: string | null;
  hash?: string | null;
  latestBaselineScore?: number | null;
  latestAssessmentSummary?: {
    latestAssessmentId?: string | null;
    hasCompletedAssessment?: boolean | null;
    latestFitScore?: number | null;
  } | null;
  createdAt?: string | null;
  status?: string | null;
};

function isReusableBaselineForScenario(
  baseline: BaselineListRow,
  bundle: ReturnType<typeof selectScenarioBundle>,
  expectedBaselineHash: string,
) {
  if (baseline.status && baseline.status !== 'ACTIVE') {
    return false;
  }

  if (baseline.hash?.trim() !== expectedBaselineHash.trim()) {
    return false;
  }

  const score =
    typeof baseline.latestBaselineScore === 'number'
      ? baseline.latestBaselineScore
      : typeof baseline.latestAssessmentSummary?.latestFitScore === 'number'
        ? baseline.latestAssessmentSummary.latestFitScore
        : null;

  if (score === null) {
    return false;
  }

  const minFitScore = bundle.scenario.expected.minFitScore;
  if (minFitScore >= 80) return score >= 80;
  if (minFitScore >= 70) return score >= 70 && score < 80;
  return score < 70;
}

async function findReusableBaselineId(
  cookie: string,
  bundle: ReturnType<typeof selectScenarioBundle>,
  expectedBaselineHash: string,
) {
  let response: Response;
  try {
    response = await fetch(`${ROOT_URL}/api/baselines?includeArchived=true`, {
      method: 'GET',
      headers: { Cookie: cookie },
    });
  } catch (error) {
    log('synthetic-loop-reusable-baseline-lookup-failed', {
      reason: error instanceof Error ? error.message : String(error),
      scenarioId: bundle.scenario.id,
      baselineFixtureId: bundle.scenario.baselineFixtureId,
    });
    return null;
  }
  const body = await readBody(response);
  if (!response.ok) {
    return null;
  }

  const baselines = Array.isArray(body) ? (body as BaselineListRow[]) : [];
  const match = baselines
    .filter((baseline) => isReusableBaselineForScenario(baseline, bundle, expectedBaselineHash))
    .sort((a, b) => {
      const aCreatedAt = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreatedAt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bCreatedAt - aCreatedAt;
    })[0];

  return match?.id ?? null;
}

function buildBaselineUploadFormData(fixture: {
  buffer: ArrayBuffer | ArrayBufferLike | Uint8Array | Buffer;
  filename: string;
  mimetype: string;
}) {
  const formData = new FormData();
  const fileBytes = Buffer.isBuffer(fixture.buffer)
    ? fixture.buffer
    : Buffer.from(fixture.buffer as ArrayBufferLike);
  formData.append(
    'file',
    new Blob([fileBytes as unknown as BlobPart], { type: fixture.mimetype }),
    fixture.filename,
  );
  return formData;
}

async function purgeBaselinesForCurrentUser(cookie: string) {
  const listResponse = await fetch(`${ROOT_URL}/api/baselines?includeArchived=true`, {
    method: 'GET',
    headers: { Cookie: cookie },
  });
  const listBody = await readBody(listResponse);
  if (!listResponse.ok) {
    return {
      ok: false,
      status: listResponse.status,
      body: listBody,
      deletedCount: 0,
    };
  }

  const baselines = Array.isArray(listBody) ? (listBody as JsonRecord[]) : [];
  let deletedCount = 0;
  for (const baseline of baselines) {
    const status = String(baseline.status ?? '').trim().toUpperCase();
    const baselineId = String(baseline.id ?? '').trim();
    if (!baselineId || status !== 'ACTIVE') continue;

    const archiveResponse = await fetch(`${API_URL}/admin/baselines/${encodeURIComponent(baselineId)}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    const archiveBody = await readBody(archiveResponse);
    if (!archiveResponse.ok) {
      return {
        ok: false,
        status: archiveResponse.status,
        body: archiveBody,
        deletedCount,
      };
    }
    deletedCount += 1;
  }

  return {
    ok: true,
    status: 200,
    body: listBody,
    deletedCount,
  };
}

async function getBrowser() {
  if (!browserPromise) {
    const { chromium } = require('playwright');
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

function parseAuthCookie(cookie: string) {
  const [name, ...valueParts] = cookie.split('=');
  return {
    name: name.trim(),
    value: valueParts.join('=').trim(),
  };
}

async function registerSyntheticUserForEmail(email: string) {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: SYNTHETIC_PASSWORD,
      confirmPassword: SYNTHETIC_PASSWORD,
      firstName: 'Synthetic',
      lastName: 'Runner',
    }),
  });
  const body = await readBody(response);
  assert(
    response.ok,
    `synthetic user registration failed for ${email}: ${body?.message ?? body?.error ?? response.status}`,
  );
  log('synthetic-loop-user-registered', {
    email,
    confirmationRequired: Boolean(body?.emailConfirmationRequired),
  });
}

function isAccessCodeRequiredError(message: string) {
  return /access code required/i.test(message);
}

function isTransientAuthError(message: string) {
  return /service temporarily unavailable|upstream unavailable|fetch failed|econnrefused|503/i.test(
    message,
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttpReady(url: string, label: string, timeoutMs = 60000) {
  const startedAt = Date.now();
  let attempt = 0;
  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        log('synthetic-loop-service-ready', { label, url, attempt });
        return;
      }
    } catch (error) {
      log('synthetic-loop-service-not-ready', {
        label,
        url,
        attempt,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    await delay(Math.min(1000 + attempt * 250, 3000));
  }
  throw new Error(`Timed out waiting for ${label} to become ready at ${url}.`);
}

type LoginAttempt =
  | { cookie: string; email: string }
  | { error: string; email: string };

async function tryLoginWithEmail(
  email: string,
  retriedAfterRegistration = false,
): Promise<LoginAttempt> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: SYNTHETIC_PASSWORD }),
    });
  } catch (error) {
    return {
      error: `fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      email,
    };
  }

  const body = await readBody(response);
  if (response.ok) {
    const setCookie = response.headers.get('set-cookie') || '';
    const cookie = setCookie.split(';')[0];
    assert(cookie, 'login did not return an auth cookie');
    return { cookie, email };
  }

  const message = String(body?.message ?? body?.error ?? response.status);
  if (/invalid credentials/i.test(message)) {
    log('synthetic-loop-login-missing-user', {
      email,
      reason: message,
    });
    if (!retriedAfterRegistration) {
      await registerSyntheticUserForEmail(email);
      return tryLoginWithEmail(email, true);
    }
  }

  return { error: message, email };
}

function selectScenarioBundle() {
  const bundles = listSyntheticGenerationScenarioBundles();
  if (SYNTHETIC_SCENARIO) {
    const exact = bundles.find(
      (bundle) =>
        bundle.scenario.id === SYNTHETIC_SCENARIO ||
        bundle.scenario.name === SYNTHETIC_SCENARIO ||
        bundle.scenario.personaKey === SYNTHETIC_SCENARIO ||
        bundle.scenario.baselineFixtureId === SYNTHETIC_SCENARIO ||
        bundle.scenario.jobFixtureId === SYNTHETIC_SCENARIO,
    );
    assert(
      exact,
      `Unknown SYNTHETIC_LOOP_SCENARIO=${SYNTHETIC_SCENARIO}. Use one of the bundled scenario ids, names, persona keys, baseline fixture ids, or job fixture ids.`,
    );
    return exact;
  }

  const preferred =
    bundles.find(
      (bundle) =>
        bundle.scenario.expected.generationMode === 'generate' &&
        bundle.scenario.expected.mustPassCalibrationBar &&
        bundle.benchmark,
    ) ?? bundles[0];

  assert(preferred, 'No synthetic generation scenario bundles were found');
  return preferred;
}

async function login(): Promise<string> {
  let lastError = '';
  for (const email of SYNTHETIC_LOGIN_EMAILS) {
    let exhaustedTransientRetries = false;
    for (let attemptNumber = 1; attemptNumber <= 5; attemptNumber += 1) {
      const attempt = await tryLoginWithEmail(email);
      if ('cookie' in attempt) {
        if (email !== SYNTHETIC_EMAIL) {
          log('synthetic-loop-founder-login-used', {
            email,
            reason: 'access-code bypass path',
          });
        }
        return attempt.cookie;
      }
      lastError = attempt.error;
      if (isAccessCodeRequiredError(attempt.error)) {
        log('synthetic-loop-access-code-required', {
          email,
          reason: attempt.error,
        });
        break;
      }
      if (isTransientAuthError(attempt.error) && attemptNumber < 5) {
        const waitMs = attemptNumber * 1000;
        log('synthetic-loop-login-retrying-transient', {
          email,
          attemptNumber,
          waitMs,
          reason: attempt.error,
        });
        await delay(waitMs);
        continue;
      }
      if (isTransientAuthError(attempt.error)) {
        exhaustedTransientRetries = true;
        log('synthetic-loop-login-transient-exhausted', {
          email,
          attempts: attemptNumber,
          reason: attempt.error,
        });
        break;
      }
      assert(false, `login failed: ${attempt.error}`);
    }
    if (exhaustedTransientRetries) {
      continue;
    }
  }
  assert(false, `login failed: ${lastError || 'no login candidates available'}`);
}

async function uploadBaseline(cookie: string, bundle: ReturnType<typeof selectScenarioBundle>) {
  const fixture = await loadSyntheticLoopBaselineFixture(bundle, RUN_ID);
  const reusableBaselineId = await findReusableBaselineId(cookie, bundle, fixture.contentHash);
  if (reusableBaselineId) {
    log('synthetic-loop-baseline-reused-existing', {
      baselineId: reusableBaselineId,
      scenarioId: bundle.scenario.id,
      baselineFixtureId: bundle.baseline.id,
      baselineFilename: SYNTHETIC_LOOP_BASELINE_FILENAME,
    });
    return { baselineId: reusableBaselineId, uploadedBody: { reused: true } };
  }

  log('synthetic-loop-baseline-fixture-loaded', {
    filename: fixture.filename,
    mimetype: fixture.mimetype,
    contentHash: fixture.contentHash,
    byteLength: fixture.buffer.byteLength,
    scenarioId: bundle.scenario.id,
    baselineFixtureId: bundle.baseline.id,
  });

  log('synthetic-loop-baseline-upload-started', {
    filename: fixture.filename,
    mimetype: fixture.mimetype,
    contentHash: fixture.contentHash,
    scenarioId: bundle.scenario.id,
    baselineFixtureId: bundle.baseline.id,
  });

  const submitUpload = async () =>
    fetch(`${ROOT_URL}/api/baselines`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: buildBaselineUploadFormData(fixture),
    });

  let response = await submitUpload();
  let body = await readBody(response);
  const bodyRecord = body as JsonRecord | null;
  const messageRecord = bodyRecord?.message as JsonRecord | undefined;
  const errorRecord = bodyRecord?.error as JsonRecord | undefined;

  const duplicateBaselineId =
    String(
      bodyRecord?.existingBaselineId ??
        messageRecord?.existingBaselineId ??
        ((messageRecord?.error as JsonRecord | undefined)?.existingBaselineId ?? null) ??
        ((messageRecord?.error as JsonRecord | undefined)?.details as JsonRecord | undefined)?.existingBaselineId ??
        errorRecord?.existingBaselineId ??
        (errorRecord?.details as JsonRecord | undefined)?.existingBaselineId ??
        '',
    ).trim() || null;

  if (response.status === 409 && duplicateBaselineId) {
    log('synthetic-loop-baseline-upload-reused', {
      filename: fixture.filename,
      mimetype: fixture.mimetype,
      baselineId: duplicateBaselineId,
      scenarioId: bundle.scenario.id,
      baselineFixtureId: bundle.baseline.id,
    });
    return { baselineId: duplicateBaselineId, uploadedBody: body, reused: true };
  }

  if (response.status === 409) {
    const purgeResult = await purgeBaselinesForCurrentUser(cookie);
    log('synthetic-loop-baseline-purge-attempted', {
      status: purgeResult.status,
      deletedCount: Number((purgeResult.body as JsonRecord | null)?.deletedCount ?? 0),
      scenarioId: bundle.scenario.id,
      baselineFixtureId: bundle.baseline.id,
    });
    if (purgeResult.ok) {
      response = await submitUpload();
      body = await readBody(response);
    }
  }

  if (!response.ok) {
    log('synthetic-loop-baseline-upload-failed', {
      filename: fixture.filename,
      mimetype: fixture.mimetype,
      status: response.status,
      error: body?.message ?? body?.error ?? body?.raw ?? null,
      scenarioId: bundle.scenario.id,
      baselineFixtureId: bundle.baseline.id,
    });
    assert(response.ok, `baseline upload failed: ${body?.message ?? body?.error ?? response.status}`);
  }

  const baselineRecord = body?.baseline as JsonRecord | undefined;
  const baselineId = String(body?.baselineId ?? baselineRecord?.id ?? '').trim();
  assert(baselineId, 'baseline upload response did not include baselineId');

  log('synthetic-loop-baseline-upload-success', {
    filename: fixture.filename,
    mimetype: fixture.mimetype,
    baselineId,
    scenarioId: bundle.scenario.id,
    baselineFixtureId: bundle.baseline.id,
  });

  return { baselineId, uploadedBody: body };
}

async function getBaselineVersions(cookie: string, baselineId: string) {
  const response = await fetch(`${ROOT_URL}/api/baselines/${encodeURIComponent(baselineId)}/versions`, {
    method: 'GET',
    headers: { Cookie: cookie },
  });
  const body = await readBody(response);
  assert(response.ok, `baseline versions failed: ${body?.message ?? body?.error ?? response.status}`);
  const versions = Array.isArray(body) ? body : Array.isArray(body?.versions) ? body.versions : [];
  assert(versions.length > 0, 'baseline versions response was empty');
  const versionId = String(versions[0]?.id ?? '').trim();
  assert(versionId, 'baseline versions response did not include a version id');
  return { versionId, versions };
}

async function analyzeBaseline(cookie: string, baselineId: string) {
  const response = await fetch(`${ROOT_URL}/api/baselines/analyze`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ baselineId }),
  });
  const body = await readBody(response);
  assert(response.ok, `baseline analyze failed: ${body?.message ?? body?.error ?? response.status}`);

  const summary = body?.latestAssessmentSummary as JsonRecord | undefined;
  assert(summary, 'baseline analyze response missing latestAssessmentSummary');
  assert(
    typeof summary.latestAssessmentId === 'string' && summary.latestAssessmentId.trim().length > 0,
    'baseline analyze response did not populate latestAssessmentId',
  );
  assert(summary.hasCompletedAssessment === true, 'baseline analyze response did not mark the baseline completed');
  assert(
    typeof summary.latestFitScore === 'number' || typeof summary.latestFitScore === 'string',
    'baseline analyze response missing latestFitScore',
  );

  return {
    responseBody: body,
    assessmentId: String(summary.latestAssessmentId),
    latestFitScore:
      typeof summary.latestFitScore === 'number'
        ? summary.latestFitScore
        : Number(summary.latestFitScore),
  };
}

async function createJob(cookie: string, bundle: ReturnType<typeof selectScenarioBundle>) {
  const { text: rawDescription, wordCount } = buildSyntheticLoopJobDescription(bundle, RUN_ID);
  log('synthetic-loop-job-description-built', {
    scenarioId: bundle.scenario.id,
    baselineFixtureId: bundle.baseline.id,
    jobFixtureId: bundle.job.id,
    wordCount,
    requirementCount: bundle.job.normalizedRequirements.length,
    responsibilityCount: bundle.job.normalizedResponsibilities.length,
  });
  const response = await fetch(`${ROOT_URL}/api/jobs`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: bundle.job.title,
      company: bundle.job.company,
      rawDescription,
      responsibilities: bundle.job.normalizedResponsibilities,
      requirements: bundle.job.normalizedRequirements,
      jdIngestionMethod: 'PASTE',
    }),
  });
  const body = await readBody(response);
  assert(response.ok, `job create failed: ${body?.message ?? body?.error ?? response.status}`);
  const jobId = String(body?.id ?? '').trim();
  assert(jobId, 'job create response did not include an id');
  return { jobId, job: body };
}

async function runCompatibilityAnalysis(cookie: string, baselineId: string, jobId: string) {
  const response = await fetch(`${ROOT_URL}/api/analysis/run`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ baselineId, jobId }),
  });
  const body = await readBody(response);
  assert(response.ok, `compatibility analysis failed: ${body?.message ?? body?.error ?? response.status}`);
  const assessmentId = String(body?.assessmentId ?? body?.id ?? '').trim();
  assert(assessmentId, 'compatibility analysis did not return an assessmentId');
  const score = typeof body?.score === 'number'
    ? body.score
    : typeof body?.overallScore === 'number'
      ? body.overallScore
      : typeof body?.fit_score === 'number'
        ? body.fit_score
        : Number(body?.score ?? body?.overallScore ?? body?.fit_score);
  assert(Number.isFinite(score), 'compatibility analysis did not return a numeric score');
  return { assessmentId, score, body };
}

async function fetchLatestAnalysis(cookie: string, assessmentId: string) {
  const response = await fetch(
    `${ROOT_URL}/api/analysis/fit-assessments/${encodeURIComponent(assessmentId)}`,
    {
      method: 'GET',
      headers: { Cookie: cookie },
    },
  );
  const body = await readBody(response);
  assert(
    response.ok,
    `latest analysis fetch failed: ${body?.message ?? body?.error ?? response.status}`,
  );
  return body as JsonRecord;
}

async function fetchBaselineSummary(cookie: string, baselineId: string) {
  const response = await fetch(`${ROOT_URL}/api/baselines/${encodeURIComponent(baselineId)}`, {
    method: 'GET',
    headers: { Cookie: cookie },
  });
  const body = await readBody(response);
  assert(response.ok, `baseline fetch failed: ${body?.message ?? body?.error ?? response.status}`);
  const summary = body?.latestAssessmentSummary as JsonRecord | undefined;
  assert(summary, 'baseline fetch missing latestAssessmentSummary');
  return { body, summary };
}

async function fetchPage(cookie: string, url: string, expectedLabels: string[]) {
  const browser = await getBrowser();
  const context = await browser.newContext();
  const authCookie = parseAuthCookie(cookie);
  await context.addCookies([
    {
      name: authCookie.name,
      value: authCookie.value,
      domain: 'localhost',
      path: '/',
    },
  ]);

  const page = await context.newPage();
  try {
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(90000);
    const response = await page.goto(url, { waitUntil: 'commit', timeout: 90000 });
    assert(response, `page navigation failed (${url}): no response`);
    assert(response.ok(), `page fetch failed (${url}): ${response.status()}`);
    await page.waitForFunction(
      (labels) => labels.some((label) => document.body?.innerText?.includes(label)),
      expectedLabels,
      { timeout: 30000 },
    );
    const bodyText = await page.locator('body').innerText();
    const matched = expectedLabels.find((label) => bodyText.includes(label));
    assert(
      matched,
      `page ${url} did not include any expected labels: ${expectedLabels.join(', ')}`,
    );
    return { html: bodyText, matched };
  } finally {
    await context.close();
  }
}

function expectedTargetLabel(score: number) {
  return score >= 70 ? 'Open Studio' : 'Start Fit Review';
}

function expectedResultsLabel(score: number) {
  return 'Start Fit Review';
}

export function expectedStudioLabel(score: number) {
  if (score < 70) return 'Start Fit Review';
  if (score >= 85) return 'Generate Resume';
  return 'Open Resume & Cover Letter Studio';
}

async function run() {
  const bundle = selectScenarioBundle();
  const startedAt = new Date().toISOString();
  log('synthetic-loop-start', {
    baseUrl: ROOT_URL,
    apiUrl: API_URL,
    scenarioId: bundle.scenario.id,
    scenarioName: bundle.scenario.name,
    startedAt,
  });

  await waitForHttpReady(`${API_URL}/status`, 'api');
  const cookie = await login();
  const uploaded = await uploadBaseline(cookie, bundle);
  log('synthetic-loop-baseline-uploaded', {
    baselineId: uploaded.baselineId,
    scenarioId: bundle.scenario.id,
    scenarioName: bundle.scenario.name,
  });

  const versions = await getBaselineVersions(cookie, uploaded.baselineId);
  log('synthetic-loop-baseline-version-loaded', {
    baselineId: uploaded.baselineId,
    baselineVersionId: versions.versionId,
    versionCount: versions.versions.length,
  });

  const analyzedBaseline = await analyzeBaseline(cookie, uploaded.baselineId);
  log('synthetic-loop-baseline-analyzed', {
    baselineId: uploaded.baselineId,
    assessmentId: analyzedBaseline.assessmentId,
    latestFitScore: analyzedBaseline.latestFitScore,
  });

  const createdJob = await createJob(cookie, bundle);
  log('synthetic-loop-job-created', {
    jobId: createdJob.jobId,
    baselineId: uploaded.baselineId,
    jobTitle: bundle.job.title,
    company: bundle.job.company,
  });

  const compatibility = await runCompatibilityAnalysis(
    cookie,
    uploaded.baselineId,
    createdJob.jobId,
  );
  log('synthetic-loop-compatibility-scored', {
    baselineId: uploaded.baselineId,
    jobId: createdJob.jobId,
    assessmentId: compatibility.assessmentId,
    score: compatibility.score,
  });

  const { summary: refreshedSummary } = await fetchBaselineSummary(
    cookie,
    uploaded.baselineId,
  );
  assert(
    typeof refreshedSummary.latestAssessmentId === 'string' &&
      refreshedSummary.latestAssessmentId.trim().length > 0,
    'baseline summary lost latestAssessmentId after compatibility scoring',
  );

  const latestAnalysis = await fetchLatestAnalysis(cookie, compatibility.assessmentId);
  const verificationCoverage = latestAnalysis?.verification_coverage as
    | {
        totalClaims?: number;
        verifiedClaims?: number;
        inferredClaims?: number;
        unverifiedClaims?: number;
        unverifiedRequirements?: unknown;
      }
    | undefined;
  const latestAnalysisRecord = latestAnalysis as JsonRecord;
  const latestAnalysisAnalysis =
    latestAnalysisRecord.analysis &&
    typeof latestAnalysisRecord.analysis === 'object' &&
    !Array.isArray(latestAnalysisRecord.analysis)
      ? (latestAnalysisRecord.analysis as JsonRecord)
      : null;
  const latestAnalysisSummary =
    typeof latestAnalysisRecord.summary === 'string'
      ? latestAnalysisRecord.summary
      : typeof latestAnalysisAnalysis?.summary === 'string'
        ? String(latestAnalysisAnalysis.summary)
        : typeof latestAnalysisRecord.analysisSummary === 'string'
          ? latestAnalysisRecord.analysisSummary
          : null;
  const latestAnalysisStrengths = Array.isArray(latestAnalysisRecord.strengths)
    ? (latestAnalysisRecord.strengths as string[])
    : Array.isArray(latestAnalysisAnalysis?.strengths)
      ? (latestAnalysisAnalysis.strengths as string[])
      : [];
  const latestAnalysisGaps = Array.isArray(latestAnalysisRecord.gaps)
    ? (latestAnalysisRecord.gaps as string[])
    : Array.isArray(latestAnalysisAnalysis?.gaps)
      ? (latestAnalysisAnalysis.gaps as string[])
      : [];
  const latestAnalysisRecommendedActions = Array.isArray(latestAnalysisRecord.recommendedActions)
    ? (latestAnalysisRecord.recommendedActions as string[])
    : Array.isArray(latestAnalysisAnalysis?.recommendedActions)
      ? (latestAnalysisAnalysis.recommendedActions as string[])
      : [];
  const createdJobRecord = createdJob.job as JsonRecord;
  const documentStrategyPlan = buildDocumentStrategyPlan({
    fitScore: compatibility.score,
    jobTitle: typeof createdJobRecord.title === 'string' ? createdJobRecord.title : bundle.job.title,
    jobCompany: typeof createdJobRecord.company === 'string' ? createdJobRecord.company : bundle.job.company,
    jobDescription:
      typeof createdJobRecord.rawDescription === 'string'
        ? createdJobRecord.rawDescription
        : bundle.job.rawDescription,
    jobRequirements: bundle.job.normalizedRequirements,
    jobResponsibilities: bundle.job.normalizedResponsibilities,
    analysisSummary: latestAnalysisSummary,
    analysisStrengths: latestAnalysisStrengths,
    analysisGaps: latestAnalysisGaps,
    analysisRecommendedActions: latestAnalysisRecommendedActions,
    baselineSections: bundle.baseline.sections,
  });

  const readinessResponse = await fetch(`${ROOT_URL}/api/resume/readiness`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      baselineId: uploaded.baselineId,
      baselineVersionId: versions.versionId,
      jobId: createdJob.jobId,
      analysisId: compatibility.assessmentId,
    }),
  });
  const readinessBody = await readBody(readinessResponse);
  assert(
    readinessResponse.ok,
    `studio readiness failed: ${readinessBody?.message ?? readinessBody?.error ?? readinessResponse.status}`,
  );
  const readinessStatus = String(readinessBody?.status ?? '').trim();
  assert(readinessStatus, 'studio readiness response missing status');
  log('synthetic-loop-readiness-inspected', {
    baselineId: uploaded.baselineId,
    jobId: createdJob.jobId,
    assessmentId: compatibility.assessmentId,
    readinessStatus,
    readinessBlocked: Boolean(readinessBody?.blocked),
    readinessReasons: Array.isArray(readinessBody?.reasons)
      ? readinessBody.reasons.map((reason: JsonRecord) => ({
          code: reason?.code ?? null,
          message: reason?.message ?? null,
        }))
      : null,
    readinessComplianceFlags: Array.isArray(readinessBody?.compliance_flags)
      ? readinessBody.compliance_flags.map((flag: JsonRecord) => ({
          code: flag?.code ?? null,
          severity: flag?.severity ?? null,
          message: flag?.message ?? null,
        }))
      : null,
  });

  log('synthetic-loop-document-strategy-plan-built', {
    baselineId: uploaded.baselineId,
    jobId: createdJob.jobId,
    score: compatibility.score,
    readinessState: readinessStatus,
    contractSource: 'buildDocumentStrategyPlan',
    ctaLabel: null,
    ctaHref: null,
    actionType: null,
    analyticsPayload: {
      fitScore: documentStrategyPlan.fitScore,
      positioningFrame: documentStrategyPlan.positioningFrame,
      documentQualityScore: documentStrategyPlan.documentQualityScore,
      qualityPass: {
        framingStrength: documentStrategyPlan.qualityPass.framingStrength,
        emphasisConfidence: documentStrategyPlan.qualityPass.emphasisConfidence,
        coverLetterDeltaCount: documentStrategyPlan.qualityPass.coverLetterDelta.length,
      },
    },
    dataSource: 'mixed',
    persistedAssessmentId: analyzedBaseline.assessmentId,
    timestamp: new Date().toISOString(),
  });

  const targetLabel = expectedTargetLabel(compatibility.score);
  const resultsLabel = expectedResultsLabel(compatibility.score);
  const studioLabel = expectedStudioLabel(compatibility.score);

  const targetUrl = `${ROOT_URL}/target?baselineId=${encodeURIComponent(uploaded.baselineId)}&jobId=${encodeURIComponent(createdJob.jobId)}`;
  const resultsUrl = `${ROOT_URL}/results?baselineId=${encodeURIComponent(uploaded.baselineId)}&jobId=${encodeURIComponent(createdJob.jobId)}`;
  const studioUrl = `${ROOT_URL}/studio?baselineId=${encodeURIComponent(uploaded.baselineId)}&baselineVersionId=${encodeURIComponent(versions.versionId)}&jobId=${encodeURIComponent(createdJob.jobId)}&analysisId=${encodeURIComponent(compatibility.assessmentId)}`;

  const targetPage = await fetchPage(cookie, targetUrl, [targetLabel]);
  log('synthetic-loop-target-cta-validated', {
    baselineId: uploaded.baselineId,
    jobId: createdJob.jobId,
    score: compatibility.score,
    readinessState: readinessStatus,
    ctaLabel: targetPage.matched,
    ctaHref: targetLabel === 'Open Studio' ? '/studio' : '/fit-review',
    actionType: targetLabel === 'Open Studio' ? 'open_studio_generate' : 'resolve_gaps',
  });

  const resultsPage = await fetchPage(cookie, resultsUrl, [resultsLabel]);
  log('synthetic-loop-results-page-validated', {
    baselineId: uploaded.baselineId,
    jobId: createdJob.jobId,
    score: compatibility.score,
    readinessState: readinessStatus,
    ctaLabel: resultsPage.matched,
  });

  const studioPage = await fetchPage(cookie, studioUrl, [studioLabel]);
  log('synthetic-loop-studio-page-validated', {
    baselineId: uploaded.baselineId,
    jobId: createdJob.jobId,
    score: compatibility.score,
    readinessState: readinessStatus,
    ctaLabel: studioPage.matched,
  });

  const resumeGenerationResponse = await fetch(`${ROOT_URL}/api/resume`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      baselineId: uploaded.baselineId,
      baselineVersionId: versions.versionId,
      jobId: createdJob.jobId,
      analysisId: compatibility.assessmentId,
      oneTap: false,
      documentStrategyPlan,
    }),
  });
  const resumeBody = await readBody(resumeGenerationResponse);
  if (!resumeGenerationResponse.ok) {
    log('synthetic-loop-resume-generation-error', {
      baselineId: uploaded.baselineId,
      jobId: createdJob.jobId,
      assessmentId: compatibility.assessmentId,
      status: resumeGenerationResponse.status,
      body: resumeBody,
    });
  }
  assert(
    resumeGenerationResponse.ok,
    `resume generation failed: ${resumeBody?.message ?? resumeBody?.error ?? resumeGenerationResponse.status}`,
  );
  const opportunityId = String(resumeBody?.opportunityId ?? '').trim();
  assert(opportunityId, 'resume generation response did not include an opportunityId');

  const coverLetterResponse = await fetch(`${ROOT_URL}/api/cover-letters`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      documentType: 'cover_letter',
      oneTap: false,
      baselineId: uploaded.baselineId,
      baselineVersionId: versions.versionId,
      jobId: createdJob.jobId,
      analysisId: compatibility.assessmentId,
      closingTemplateKey: DEFAULT_COVER_LETTER_CLOSING_TEMPLATE_KEY,
      jobContext: {
        allowedCompanies: [bundle.job.company],
        allowedRoleTitles: [bundle.job.title],
      },
      documentStrategyPlan,
      maxWords: 280,
    }),
  });
  const coverLetterBody = await readBody(coverLetterResponse);
  if (!coverLetterResponse.ok) {
    log('synthetic-loop-cover-letter-generation-error', {
      baselineId: uploaded.baselineId,
      jobId: createdJob.jobId,
      assessmentId: compatibility.assessmentId,
      status: coverLetterResponse.status,
      body: coverLetterBody,
    });
  }
  assert(
    coverLetterResponse.ok,
    `cover letter generation failed: ${coverLetterBody?.message ?? coverLetterBody?.error ?? coverLetterResponse.status}`,
  );

  const opportunityListResponse = await fetch(
    `${ROOT_URL}/api/opportunities?analysisId=${encodeURIComponent(compatibility.assessmentId)}`,
    {
      method: 'GET',
      headers: { Cookie: cookie },
    },
  );
  const opportunityListBody = await readBody(opportunityListResponse);
  assert(
    opportunityListResponse.ok,
    `opportunities fetch failed: ${opportunityListBody?.message ?? opportunityListBody?.error ?? opportunityListResponse.status}`,
  );
  const opportunityCount = Array.isArray(opportunityListBody) ? opportunityListBody.length : 0;
  assert(opportunityCount > 0, 'no opportunity was persisted for the synthetic loop');

  log('synthetic-loop-success', {
    baselineId: uploaded.baselineId,
    baselineVersionId: versions.versionId,
    jobId: createdJob.jobId,
    analysisId: compatibility.assessmentId,
    score: compatibility.score,
    readinessState: readinessStatus,
    ctaLabel: targetPage.matched,
    targetHref: targetLabel === 'Open Studio' ? '/studio' : '/fit-review',
    studioCtaLabel: studioPage.matched,
    opportunityId,
    opportunityCount,
    finishedAt: new Date().toISOString(),
  });
}

if (require.main === module) {
  void run()
    .catch((error) => {
      log('synthetic-loop-failure', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
        finishedAt: new Date().toISOString(),
      });
      process.exitCode = 1;
    })
    .finally(async () => {
      if (browserPromise) {
        const browser = await browserPromise;
        await browser.close();
        browserPromise = null;
      }
    });
}
