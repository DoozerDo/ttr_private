#!/usr/bin/env node

const ROOT_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const API_URL = (process.env.API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
const SYNTHETIC_EMAIL = process.env.SYNTHETIC_USER_EMAIL || "synthetic-core-loop@targetthisrole.local";
const SYNTHETIC_PASSWORD = process.env.SYNTHETIC_USER_PASSWORD || "SyntheticUserPass!123";
const ADMIN_USER_ID = (process.env.SYNTHETIC_ADMIN_USER_ID || "").trim();

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
  const response = await fetch(`${ROOT_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: SYNTHETIC_EMAIL, password: SYNTHETIC_PASSWORD }),
  });
  const body = await readJson(response);
  assert(response.ok, `login failed: ${body?.message ?? body?.error ?? response.status}`);
  const setCookie = response.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  assert(cookie, "login did not return an auth cookie");
  return { cookie, userId: body?.user?.id ?? body?.id ?? null };
}

async function seedSyntheticFixture() {
  assert(ADMIN_USER_ID, "SYNTHETIC_ADMIN_USER_ID is required to seed the synthetic fixture");
  const response = await fetch(`${API_URL}/admin/synthetic-transactions/core-loop-smoke/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-dev-user-id": ADMIN_USER_ID,
    },
  });
  const body = await readJson(response);
  assert(response.ok, `synthetic seed failed: ${body?.message ?? body?.error ?? response.status}`);
  assert(body?.status === "succeeded", `synthetic seed did not succeed: ${body?.errorMessage ?? "unknown reason"}`);
  return body;
}

async function fetchLatestAnalysis(cookie, jobId) {
  const response = await fetch(`${ROOT_URL}/api/analysis/latest?jobId=${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: { Cookie: cookie },
  });
  const body = await readJson(response);
  assert(response.ok, `analysis latest failed: ${body?.message ?? body?.error ?? response.status}`);
  assert(body, "analysis latest returned no body");
  return body;
}

async function fetchResultsPage(cookie, baselineId, jobId) {
  const response = await fetch(
    `${ROOT_URL}/results?baselineId=${encodeURIComponent(baselineId)}&jobId=${encodeURIComponent(jobId)}`,
    { method: "GET", headers: { Cookie: cookie } },
  );
  const html = await response.text();
  assert(response.ok, `results page failed: ${response.status}`);
  assert(html.includes("Run Career Compatibility Analysis") || html.includes("Review Results"), "results page did not contain a canonical next action");
  return html;
}

async function main() {
  const startedAt = new Date().toISOString();
  log("synthetic-core-loop-start", { baseUrl: ROOT_URL, apiUrl: API_URL, startedAt });

  const seed = await seedSyntheticFixture();
  const { cookie } = await login();

  const baselineId = String(seed?.summary?.baselineId ?? "");
  const jobId = String(seed?.summary?.jobId ?? "");
  const assessmentId = String(seed?.summary?.assessmentId ?? "");

  assert(baselineId, "seed response missing baselineId");
  assert(jobId, "seed response missing jobId");
  assert(assessmentId, "seed response missing assessmentId");

  const analysis = await fetchLatestAnalysis(cookie, jobId);
  const fitScore =
    typeof analysis?.score === "number"
      ? analysis.score
      : typeof analysis?.fitScore === "number"
        ? analysis.fitScore
        : null;
  assert(typeof fitScore === "number", "analysis latest did not include a numeric score");

  const nextAction = deriveNextAction({
    analysisPresent: true,
    fitScore,
    hasCompletedGeneration: Boolean(analysis?.hasCompletedGeneration ?? analysis?.generatedAt ?? analysis?.resumeGeneratedAt),
    opportunityAlreadySaved: Boolean(analysis?.opportunityAlreadySaved ?? analysis?.opportunityId),
  });

  assert(nextAction, "derived nextAction was empty");

  await fetchResultsPage(cookie, baselineId, jobId);

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
