#!/usr/bin/env node

function normalizeBaseUrl({ key, rawValue, fallback }) {
  const candidate = rawValue == null || String(rawValue).trim() === "" ? fallback : String(rawValue).trim();
  if (!candidate) throw new Error(`${key} must be a non-empty URL (got empty value)`);
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

const API_URL = normalizeBaseUrl({
  key: "API_BASE_URL",
  rawValue: process.env.API_BASE_URL,
  fallback: "http://localhost:3001",
});

const LOGIN_EMAIL = process.env.SMOKE_LOGIN_EMAIL || "";
const LOGIN_PASSWORD = process.env.SMOKE_LOGIN_PASSWORD || process.env.SYNTHETIC_USER_PASSWORD || "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

async function login() {
  assert(LOGIN_EMAIL, "Missing SMOKE_LOGIN_EMAIL env var (email for the deployed environment)");
  assert(LOGIN_PASSWORD, "Missing SMOKE_LOGIN_PASSWORD (or SYNTHETIC_USER_PASSWORD) env var");

  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  const body = await readJson(response);
  assert(response.ok, `login failed: ${body?.message ?? body?.error ?? response.status}`);
  const accessToken = body?.accessToken ?? body?.token ?? null;
  assert(accessToken, "login succeeded but no accessToken was returned by the API");
  return { accessToken, userId: body?.user?.id ?? body?.id ?? null };
}

async function seedSyntheticCoreLoop(accessToken) {
  const response = await fetch(`${API_URL}/admin/synthetic-transactions/core-loop-smoke/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = await readJson(response);
  assert(response.ok, `synthetic seed failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  assert(body?.status === "succeeded", `synthetic seed did not succeed: ${JSON.stringify(body)}`);
  return body;
}

async function fetchBaselineVersionId(accessToken, baselineId) {
  const response = await fetch(`${API_URL}/baselines/${encodeURIComponent(baselineId)}/versions`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await readJson(response);
  assert(response.ok, `baseline versions fetch failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  const versions = Array.isArray(body) ? body : Array.isArray(body?.versions) ? body.versions : [];
  const first = versions[0] ?? null;
  const id = typeof first?.id === "string" ? first.id : null;
  assert(id, "baseline versions response missing version id");
  return id;
}

async function fetchAssessment(accessToken, assessmentId) {
  const response = await fetch(`${API_URL}/analysis/fit-assessments/${encodeURIComponent(assessmentId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await readJson(response);
  assert(response.ok, `fit assessment fetch failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  return body;
}

function assertRenderableResumeResponseBody(payload) {
  const summary = String(payload?.preview?.resume?.summary ?? "").trim();
  assert(summary.length > 0, "resume responseBody preview.resume.summary was empty");
}

function assertRenderableCoverLetterResponseBody(payload) {
  const paragraphs = payload?.preview?.coverLetter?.paragraphs;
  assert(Array.isArray(paragraphs) && paragraphs.length > 0, "cover letter responseBody preview.coverLetter.paragraphs missing/empty");
}

async function generateResume(accessToken, { baselineId, baselineVersionId, jobId, analysisId }) {
  const response = await fetch(`${API_URL}/resume/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ baselineId, baselineVersionId, jobId, analysisId }),
  });
  const body = await readJson(response);
  assert(response.ok, `resume generation failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  assertRenderableResumeResponseBody(body);
  return body;
}

async function generateCoverLetter(accessToken, { baselineId, baselineVersionId, jobId, analysisId }) {
  const response = await fetch(`${API_URL}/cover-letters/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ baselineId, baselineVersionId, jobId, analysisId }),
  });
  const body = await readJson(response);
  assert(response.ok, `cover letter generation failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  assert(typeof body?.content === "string" && body.content.trim().length > 0, "cover letter generation returned empty content");
  return body;
}

async function fetchStudioArtifacts(accessToken, { baselineId, baselineVersionId, jobId, analysisId }) {
  const params = new URLSearchParams({ baselineId, baselineVersionId, jobId, analysisId });
  const response = await fetch(`${API_URL}/studio/artifacts?${params.toString()}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await readJson(response);
  assert(response.ok, `studio artifacts fetch failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  return body;
}

function assertHydratedArtifactsNotMissing(state) {
  assert(state && typeof state === "object", "studio artifacts returned empty payload");
  const status = String(state.status ?? "").toLowerCase();
  assert(status !== "missing", `studio artifacts status was missing after generation (status=${status || "empty"})`);
  assert(state.resume && state.resume.responseBody, "studio artifacts missing resume.responseBody after generation");
  assert(state.coverLetter && state.coverLetter.responseBody, "studio artifacts missing coverLetter.responseBody after generation");
  assertRenderableResumeResponseBody(state.resume.responseBody);
  assertRenderableCoverLetterResponseBody(state.coverLetter.responseBody);
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(JSON.stringify({ message: "beta-loop-smoke-start", apiUrl: API_URL, startedAt }));

  const auth = await login();
  const seed = await seedSyntheticCoreLoop(auth.accessToken);

  const baselineId = String(seed?.summary?.baselineId ?? "");
  const jobId = String(seed?.summary?.jobId ?? "");
  const assessmentId = String(seed?.summary?.assessmentId ?? "");
  assert(baselineId, "seed response missing baselineId");
  assert(jobId, "seed response missing jobId");
  assert(assessmentId, "seed response missing assessmentId");

  const baselineVersionId = await fetchBaselineVersionId(auth.accessToken, baselineId);
  const assessment = await fetchAssessment(auth.accessToken, assessmentId);
  const score =
    typeof assessment?.overallScore === "number"
      ? assessment.overallScore
      : typeof assessment?.score === "number"
        ? assessment.score
        : null;
  assert(typeof score === "number", "assessment did not include a numeric score");
  assert(score >= 80, `beta loop requires score>=80 (got ${score})`);

  await generateResume(auth.accessToken, { baselineId, baselineVersionId, jobId, analysisId: assessmentId });
  await generateCoverLetter(auth.accessToken, { baselineId, baselineVersionId, jobId, analysisId: assessmentId });

  const hydrated1 = await fetchStudioArtifacts(auth.accessToken, {
    baselineId,
    baselineVersionId,
    jobId,
    analysisId: assessmentId,
  });
  assertHydratedArtifactsNotMissing(hydrated1);

  const hydrated2 = await fetchStudioArtifacts(auth.accessToken, {
    baselineId,
    baselineVersionId,
    jobId,
    analysisId: assessmentId,
  });
  assertHydratedArtifactsNotMissing(hydrated2);

  console.log(
    JSON.stringify({
      message: "beta-loop-smoke-success",
      baselineId,
      baselineVersionId,
      jobId,
      assessmentId,
      score,
      finishedAt: new Date().toISOString(),
    }),
  );
}

main().catch((error) => {
  console.log(
    JSON.stringify({
      message: "beta-loop-smoke-failure",
      error: error instanceof Error ? error.message : String(error),
      finishedAt: new Date().toISOString(),
    }),
  );
  process.exitCode = 1;
});

