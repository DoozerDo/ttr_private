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
const SYNTHETIC_EMAIL = process.env.SYNTHETIC_USER_EMAIL || "synthetic-core-loop@targetthisrole.local";
const SYNTHETIC_PASSWORD = process.env.SYNTHETIC_USER_PASSWORD || "SyntheticUserPass!123";

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
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: SYNTHETIC_EMAIL, password: SYNTHETIC_PASSWORD }),
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

async function fetchLatestAnalysis(accessToken, jobId) {
  const response = await fetch(`${API_URL}/analysis/latest?jobId=${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await readJson(response);
  assert(response.ok, `analysis latest failed: ${body?.message ?? body?.error ?? response.status}`);
  assert(body, "analysis latest returned no body");
  return body;
}

async function fetchResultsPage({ cookie, accessToken }, baselineId, jobId) {
  const response = await fetch(
    `${ROOT_URL}/results?baselineId=${encodeURIComponent(baselineId)}&jobId=${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    },
  );
  const html = await response.text();
  assert(response.ok, `results page failed: ${response.status}`);
  assert(html.includes("Run Career Compatibility Analysis") || html.includes("Review Results"), "results page did not contain a canonical next action");
  return html;
}

async function main() {
  const startedAt = new Date().toISOString();
  log("synthetic-core-loop-start", { baseUrl: ROOT_URL, apiUrl: API_URL, startedAt });

  const auth = await login();
  const seed = await seedSyntheticFixture(auth.accessToken);
  const seededEmail = seed?.summary?.syntheticUserEmail ?? null;
  if (seededEmail && String(seededEmail).trim() !== SYNTHETIC_EMAIL) {
    log("synthetic-core-loop-user-mismatch", {
      seededEmail: String(seededEmail),
      loginEmail: SYNTHETIC_EMAIL,
    });
  }

  const baselineId = String(seed?.summary?.baselineId ?? "");
  const jobId = String(seed?.summary?.jobId ?? "");
  const assessmentId = String(seed?.summary?.assessmentId ?? "");

  assert(baselineId, "seed response missing baselineId");
  assert(jobId, "seed response missing jobId");
  assert(assessmentId, "seed response missing assessmentId");

  const analysis = await fetchLatestAnalysis(auth.accessToken, jobId);
  const fitScore =
    typeof analysis?.score === "number"
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
