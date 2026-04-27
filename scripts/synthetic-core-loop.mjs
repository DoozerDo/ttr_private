#!/usr/bin/env node

function normalizeBaseUrl({ key, rawValue, fallback }) {
  const candidate =
    rawValue == null || String(rawValue).trim() === "" ? fallback : String(rawValue).trim();

  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new Error(`${key} must be a non-empty URL (got empty value)`);
  }

  const normalized = candidate.replace(/\/+$/, "");

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${key} must be a valid http(s) URL (got "${candidate}")`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${key} must use http or https (got "${parsed.protocol}")`);
  }

  return normalized;
}

const ROOT_URL = normalizeBaseUrl({
  key: "BASE_URL",
  rawValue: process.env.BASE_URL,
  fallback: "http://localhost:3000",
});
const API_URL = normalizeBaseUrl({
  key: "API_BASE_URL",
  rawValue: process.env.API_BASE_URL,
  fallback: "http://localhost:3001",
});
const LOGIN_EMAIL = process.env.SMOKE_LOGIN_EMAIL || "michaeltalbert@hotmail.com";
const LOGIN_PASSWORD = process.env.SYNTHETIC_USER_PASSWORD;

function log(message, extra) {
  const payload = {
    timestamp: new Date().toISOString(),
    message,
    ...(extra ? { ...extra } : {}),
  };
  console.log(JSON.stringify(payload));
}

async function readJson(response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function deriveNextAction(input) {
  if (!input.analysisPresent) {
    return "CONTINUE_ANALYSIS";
  }
  if (input.fitScore < 70) {
    return "RESOLVE_GAPS";
  }
  if (!input.hasCompletedGeneration) {
    return "GENERATE_RESUME";
  }
  if (!input.opportunityAlreadySaved) {
    return "ADD_TO_OPPORTUNITIES";
  }
  return "REVIEW_RESULTS";
}

async function login() {
  assert(LOGIN_PASSWORD, "Missing SYNTHETIC_USER_PASSWORD env var for smoke login password");
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  const body = await readJson(response);
  assert(response.ok, `login failed: ${body?.message ?? body?.error ?? response.status}`);

  const accessToken = body?.accessToken ?? body?.token ?? null;
  assert(accessToken, "login succeeded but no accessToken was returned by the API");

  const setCookie = response.headers.get("set-cookie") || "";
  const cookie = setCookie ? setCookie.split(";")[0] : "";

  return {
    accessToken,
    cookie: cookie || null,
    userId: body?.user?.id ?? body?.id ?? null,
  };
}

async function seedSyntheticFixture(accessToken) {
  assert(accessToken, "seedSyntheticFixture requires an accessToken");
  const response = await fetch(`${API_URL}/admin/synthetic-transactions/core-loop-smoke/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = await readJson(response);
  if (!response.ok) {
    const details = body ? JSON.stringify(body) : String(response.status);
    throw new Error(`synthetic seed failed: HTTP ${response.status} ${details}`);
  }
  if (body?.status !== "succeeded") {
    const rawError = body?.errorMessage ?? body?.message ?? body?.error ?? null;
    const stepSummary = Array.isArray(body?.stepResults)
      ? body.stepResults
          .map((step) => `${step.step}:${step.status}${step.errorMessage ? ` (${step.errorMessage})` : ""}`)
          .join(", ")
      : null;
    if (!rawError) {
      throw new Error(
        `synthetic seed did not succeed: missing errorMessage in response body (status=${String(body?.status ?? "unknown")})${stepSummary ? ` steps=${stepSummary}` : ""}`,
      );
    }
    const extra =
      rawError === "Conflict Exception" || rawError === "Bad Request Exception"
        ? ` body=${JSON.stringify(body)}${stepSummary ? ` steps=${stepSummary}` : ""}`
        : stepSummary
          ? ` steps=${stepSummary}`
          : "";
    throw new Error(`synthetic seed did not succeed: ${rawError}${extra}`);
  }
  return body;
}

async function fetchFitAssessment(accessToken, { assessmentId, jobId } = {}) {
  assert(accessToken, "fetchFitAssessment requires an accessToken");

  if (assessmentId) {
    const response = await fetch(`${API_URL}/analysis/fit-assessments/${encodeURIComponent(assessmentId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await readJson(response);
    assert(
      response.ok,
      `analysis fit-assessment failed (assessmentId=${assessmentId}): ${body?.message ?? body?.error ?? response.status}`,
    );
    assert(body, "analysis fit-assessment returned no body");
    return body;
  }

  if (jobId) {
    const response = await fetch(`${API_URL}/analysis/job/${encodeURIComponent(jobId)}/latest`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await readJson(response);
    assert(
      response.ok,
      `analysis latest-by-job failed (jobId=${jobId}): ${body?.message ?? body?.error ?? response.status}`,
    );
    assert(body, "analysis latest-by-job returned no body");
    return body;
  }

  throw new Error("analysis verification requires assessmentId or jobId from seed summary");
}

async function fetchResultsPage({ cookie, accessToken }, baselineId, jobId) {
  const ctaTestId = "results-hero-primary-cta";
  const url = `${ROOT_URL}/results?baselineId=${encodeURIComponent(baselineId)}&jobId=${encodeURIComponent(jobId)}`;

  // Results is a client component; the canonical CTA may only appear after hydration.
  // Use Playwright to assert against the rendered DOM (no brittle HTML text matching).
  let playwright;
  try {
    playwright = await import("playwright");
  } catch (error) {
    throw new Error(
      `results page assertion requires Playwright. Failed to import playwright: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const { chromium } = playwright;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    extraHTTPHeaders: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (cookie) {
    const [nameRaw, ...rest] = String(cookie).split("=");
    const name = String(nameRaw ?? "").trim();
    const value = rest.join("=");
    if (name && value) {
      await context.addCookies([
        {
          name,
          value,
          domain: "localhost",
          path: "/",
        },
      ]);
    }
  }

  const page = await context.newPage();
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    assert(response, "results page navigation returned no response");
    assert(response.ok(), `results page failed: ${response.status()}`);

    const locator = page.locator(`[data-testid="${ctaTestId}"]`);
    await locator.waitFor({ state: "attached", timeout: 30000 });

    const href = await locator.getAttribute("href");
    if (!href) {
      const tagName = await locator.evaluate((el) => el.tagName);
      const snippet = await page.content();
      throw new Error(
        JSON.stringify({
          message: `results page canonical next action missing href (${ctaTestId})`,
          url: page.url(),
          markerExists: true,
          markerTag: tagName,
          htmlExcerpt: snippet.slice(0, 800),
        }),
      );
    }
    const looksValidDestination =
      href.startsWith("/") || href.startsWith("http://") || href.startsWith("https://");
    assert(looksValidDestination, `results page canonical next action href looked invalid: ${href}`);

    return await page.content();
  } catch (error) {
    const markerExists = await page.locator(`[data-testid="${ctaTestId}"]`).count().then((n) => n > 0).catch(() => false);
    const htmlExcerpt = await page.content().then((c) => c.slice(0, 800)).catch(() => null);
    const textExcerpt = await page.textContent("body").then((t) => String(t ?? "").slice(0, 500)).catch(() => null);
    throw new Error(
      JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        url: page.url?.() ?? url,
        loaded: true,
        markerExists,
        htmlExcerpt,
        textExcerpt,
      }),
    );
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function assertStudioWorkflow({ cookie, accessToken }, { baselineId, jobId, assessmentId }) {
  const studioUrl = `${ROOT_URL}/studio?baselineId=${encodeURIComponent(baselineId)}&jobId=${encodeURIComponent(jobId)}&analysisId=${encodeURIComponent(assessmentId)}`;

  let playwright;
  try {
    playwright = await import("playwright");
  } catch (error) {
    throw new Error(
      `studio assertion requires Playwright. Failed to import playwright: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const { chromium } = playwright;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    extraHTTPHeaders: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (cookie) {
    const [nameRaw, ...rest] = String(cookie).split("=");
    const name = String(nameRaw ?? "").trim();
    const value = rest.join("=");
    if (name && value) {
      await context.addCookies([{ name, value, domain: "localhost", path: "/" }]);
    }
  }

  const page = await context.newPage();
  try {
    const response = await page.goto(studioUrl, { waitUntil: "domcontentloaded" });
    assert(response, "studio page navigation returned no response");
    assert(response.ok(), `studio page failed: ${response.status()}`);

    const studioStepper = page.locator('[data-testid="unlock-path-studio"]');
    await studioStepper.waitFor({ state: "attached", timeout: 30000 });
    const studioState = await studioStepper.getAttribute("data-state");
    assert(studioState && studioState !== "LOCKED", `studio stepper state should not be LOCKED on /studio (got ${studioState ?? "null"})`);

    // Contract: Ready-to-generate must not sit idle with both artifacts missing.
    // Allow outcomes:
    // - generation starts (generating markers appear)
    // - materials render (missing markers disappear)
    // - an explicit failure shell appears with a message
    const resumeMissing = page.locator('[data-testid="studio-resume-missing"]');
    const coverMissing = page.locator('[data-testid="studio-cover-missing"]');
    const generatingAny = page.locator('[data-testid="studio-auto-generation-status"],[data-testid="studio-resume-generating"],[data-testid="studio-cover-generating"],[data-testid="studio-generation-ready-shell"]');
    const failureMessage = page.locator('[data-testid="studio-generation-ready-failure-message"]');

    await page.waitForFunction(
      () => {
        const resumeMissingEl = document.querySelector('[data-testid="studio-resume-missing"]');
        const coverMissingEl = document.querySelector('[data-testid="studio-cover-missing"]');
        const generatingEl = document.querySelector('[data-testid="studio-auto-generation-status"],[data-testid="studio-resume-generating"],[data-testid="studio-cover-generating"],[data-testid="studio-generation-ready-shell"]');
        const failureEl = document.querySelector('[data-testid="studio-generation-ready-failure-message"]');

        const bothMissing = Boolean(resumeMissingEl && coverMissingEl);
        return !bothMissing || Boolean(generatingEl) || Boolean(failureEl);
      },
      { timeout: 30000 },
    ).catch(async () => {
      const url = page.url();
      const state = await studioStepper.getAttribute("data-state").catch(() => null);
      const marker = {
        resumeMissing: await resumeMissing.count().then((n) => n > 0).catch(() => false),
        coverMissing: await coverMissing.count().then((n) => n > 0).catch(() => false),
        generatingAny: await generatingAny.count().then((n) => n > 0).catch(() => false),
        failureMessage: await failureMessage.count().then((n) => n > 0).catch(() => false),
      };
      const htmlExcerpt = await page.content().then((c) => c.slice(0, 900)).catch(() => null);
      const textExcerpt = await page.textContent("body").then((t) => String(t ?? "").slice(0, 500)).catch(() => null);
      throw new Error(
        JSON.stringify({
          message: "studio ready-to-generate state appeared idle (both artifacts missing, no generating, no failure)",
          url,
          studioStepperState: state,
          markers: marker,
          htmlExcerpt,
          textExcerpt,
        }),
      );
    });

    return true;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  log("synthetic-core-loop-start", { baseUrl: ROOT_URL, apiUrl: API_URL, startedAt });

  log("synthetic-core-loop-login-attempt", { loginEmail: LOGIN_EMAIL });
  const auth = await login();
  const seed = await seedSyntheticFixture(auth.accessToken);
  const seededOwnerUserId = seed?.summary?.ownerUserId ?? null;
  log("synthetic-core-loop-seed-user", {
    loginEmail: LOGIN_EMAIL,
    ownerUserId: seededOwnerUserId ? String(seededOwnerUserId) : null,
  });

  const baselineId = String(seed?.summary?.baselineId ?? "");
  const jobId = String(seed?.summary?.jobId ?? "");
  const assessmentId = String(seed?.summary?.assessmentId ?? "");

  assert(baselineId, "seed response missing baselineId");
  assert(jobId, "seed response missing jobId");
  assert(assessmentId, "seed response missing assessmentId");

  const analysis = await fetchFitAssessment(auth.accessToken, { assessmentId, jobId });
  const fitScore =
    typeof analysis?.overallScore === "number"
      ? analysis.overallScore
      : typeof analysis?.score === "number"
        ? analysis.score
        : typeof analysis?.fitScore === "number"
          ? analysis.fitScore
          : null;
  assert(typeof fitScore === "number", "analysis latest did not include a numeric score");
  assert(fitScore >= 70, `fit score ${fitScore} is below the core loop threshold (>= 70)`);

  const nextAction = deriveNextAction({
    analysisPresent: true,
    fitScore,
    hasCompletedGeneration: Boolean(analysis?.hasCompletedGeneration ?? analysis?.generatedAt ?? analysis?.resumeGeneratedAt),
    opportunityAlreadySaved: Boolean(analysis?.opportunityAlreadySaved ?? analysis?.opportunityId),
  });

  assert(nextAction, "derived nextAction was empty");

  await fetchResultsPage(auth, baselineId, jobId);
  await assertStudioWorkflow(auth, { baselineId, jobId, assessmentId });

  log("synthetic-core-loop-success", {
    syntheticRunId: seed?.syntheticRunId ?? null,
    baselineId,
    jobId,
    assessmentId,
    score: fitScore,
    nextAction,
    finishedAt: new Date().toISOString(),
  });
}

main().catch((error) => {
  log("synthetic-core-loop-failure", {
    error: error instanceof Error ? error.message : String(error),
    finishedAt: new Date().toISOString(),
  });
  process.exitCode = 1;
});
