#!/usr/bin/env node
/**
 * Lightweight UI verification for search sets + expanded fit guardrails.
 *
 * Usage:
 *   AUTH_TOKEN=... AUTH_COOKIE="name=value" BASE_URL=http://localhost:3000 INTERVIEW_RECORD_ID=... [BASELINE_VERSION_ID=...] [JOB_ID=...] npm run verify:ui
 *   (JOB_ID and BASELINE_VERSION_ID are optional overrides; BASE_URL defaults to http://localhost:3000.)
 */

const path = require("path");

const apiRoutes = require(path.join(__dirname, "../apps/web/lib/apiRoutes.json"));

const tag = "[verify-ui]";
const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "") || "http://localhost:3000";
const interviewRecordId = process.env.INTERVIEW_RECORD_ID;
const baselineVersionIdEnv = process.env.BASELINE_VERSION_ID;
const jobIdEnv = process.env.JOB_ID;
const authToken = (process.env.AUTH_TOKEN || "").trim();
const authCookie = (process.env.AUTH_COOKIE || "").trim();

if (!interviewRecordId) {
  console.error(`${tag} Missing required INTERVIEW_RECORD_ID environment variable.`);
  process.exitCode = 1;
  process.exit(1);
}

const summary = [
  { label: "Baseline selection", status: "PENDING", detail: "" },
  { label: "Create search set", status: "PENDING", detail: "" },
  { label: "Expanded fit compute", status: "PENDING", detail: "" },
];

console.log(`${tag} AUTH_TOKEN present: ${Boolean(authToken)}`);
console.log(`${tag} AUTH_COOKIE present: ${Boolean(authCookie)}`);

if (!authToken && !authCookie) {
  console.warn(
    `${tag} No AUTH_TOKEN or AUTH_COOKIE provided; protected endpoints may return 401 Unauthorized.`,
  );
}

let exitCode = 0;
const formatPayloadMessage = (payload, fallback) => {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (payload && typeof payload === "object") {
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  }
  return fallback;
};

const markEndpointFailure = () => {
  if (exitCode < 2) {
    exitCode = 2;
  }
};

const markSchemaFailure = () => {
  if (exitCode < 3) {
    exitCode = 3;
  }
};

const normalizeTimestamp = (value) => {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

function buildHeaders(json = false) {
  const headers = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  } else if (authCookie) {
    headers.Cookie = authCookie;
  }
  if (json) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function request(relativePath, init = {}, options = {}) {
  const normalizedPath = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  const url = `${BASE_URL}${normalizedPath}`;
  const headerBase = buildHeaders(Boolean(options.json));
  const headers = { ...headerBase, ...(init.headers ?? {}) };
  let response;

  try {
    response = await fetch(url, {
      credentials: "include",
      ...init,
      headers,
    });
  } catch (error) {
    throw new Error(`Failed to fetch ${url}: ${error instanceof Error ? error.message : error}`);
  }

  if (response.status === 401 && !authToken && !authCookie) {
    console.error(
      `${tag} 401 Unauthorized. Set AUTH_COOKIE (preferred) or AUTH_TOKEN to call protected endpoints.`,
    );
  }

  const text = await response.text().catch(() => "");
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  return { response, parsed, text, url };
}

function selectLatestBaselineVersion(payload) {
  if (!Array.isArray(payload)) return null;
  const candidates = [];
  payload.forEach((baseline) => {
    if (!baseline || typeof baseline !== "object") return;
    const versions =
      Array.isArray(baseline.versions) && baseline.versions.length
        ? baseline.versions
        : Array.isArray(baseline.baselineVersions)
          ? baseline.baselineVersions
          : [];

    versions.forEach((version) => {
      if (!version || typeof version !== "object") return;
      const versionId = typeof version.id === "string" ? version.id : undefined;
      if (!versionId) return;

      const versionLabel =
        (typeof version.label === "string" && version.label.trim()) ||
        (typeof version.filename === "string" && version.filename.trim());
      const baselineLabel =
        (typeof baseline.label === "string" && baseline.label.trim()) ||
        (typeof baseline.name === "string" && baseline.name.trim());
      const label =
        versionLabel || baselineLabel || `baseline ${baseline.id ?? "unknown"}` || versionId;

      const timestamp =
        normalizeTimestamp(version.updatedAt ?? version.createdAt) ??
        normalizeTimestamp(baseline.updatedAt ?? baseline.createdAt) ??
        0;

      candidates.push({
        id: versionId,
        label,
        timestamp,
        fallback: `${baseline.id ?? ""}-${versionId}`,
      });
    });
  });

  if (!candidates.length) return null;

  return candidates.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return b.timestamp - a.timestamp;
    }
    return a.fallback.localeCompare(b.fallback);
  })[0];
}

async function resolveBaselineVersion() {
  if (baselineVersionIdEnv) {
    return { id: baselineVersionIdEnv.trim(), label: "env override" };
  }

  const { response, parsed, text, url } = await request(apiRoutes.baselines);
  if (!response.ok) {
    const message = formatPayloadMessage(parsed, response.statusText || "Request failed");
    throw new Error(`GET ${url} ${response.status} ${response.statusText}: ${message}`);
  }

  const selection = selectLatestBaselineVersion(parsed);
  if (!selection) {
    throw new Error("Base response did not include any baseline versions.");
  }

  return selection;
}

async function resolveJobCandidate() {
  try {
    const { response, parsed, url } = await request(apiRoutes.jobs);
    if (!response.ok) {
      console.warn(
        `${tag} Skipping job lookup: GET ${url} ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const jobs = Array.isArray(parsed) ? parsed : [];
    const normalized = jobs
      .filter((job) => job && typeof job === "object" && typeof job.sourceUrl === "string")
      .map((job) => ({
        ...job,
        sourceUrl: job.sourceUrl.trim(),
      }))
      .filter((job) => job.sourceUrl);

    if (!normalized.length) {
      return null;
    }

    let candidate = null;
    if (jobIdEnv) {
      candidate = normalized.find((job) => job.id === jobIdEnv) ?? null;
      if (!candidate) {
        console.warn(`${tag} JOB_ID=${jobIdEnv} not found among ${normalized.length} jobs`);
      }
    }

    if (!candidate) {
      normalized.sort((a, b) => {
        const aTs = normalizeTimestamp(a.updatedAt ?? a.createdAt) ?? 0;
        const bTs = normalizeTimestamp(b.updatedAt ?? b.createdAt) ?? 0;
        if (aTs !== bTs) return bTs - aTs;
        return (b.id ?? "").localeCompare(a.id ?? "");
      });
      candidate = normalized[0];
    }

    return {
      id: candidate.id,
      sourceUrl: candidate.sourceUrl,
      title: candidate.title ?? "unknown job",
    };
  } catch (error) {
    console.warn(`${tag} Unable to resolve JOB_ID: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

function hasExpandedScore(payload) {
  if (!payload || typeof payload !== "object") return null;
  const assessment = payload.expandedFitAssessment ?? payload.expanded_fit_assessment;
  if (!assessment || typeof assessment !== "object") return null;
  const score = assessment.expandedScore ?? assessment.expanded_score;
  return typeof score === "number" ? score : null;
}

(async function main() {
  console.log(`${tag} BASE_URL=${BASE_URL}`);
  console.log(`${tag} INTERVIEW_RECORD_ID=${interviewRecordId}`);

  const baselineStep = summary[0];
  let baselineVersionId = "";
  let baselineLabel = "";

  try {
    const selection = await resolveBaselineVersion();
    baselineVersionId = selection.id;
    baselineLabel = selection.label;
    baselineStep.status = "PASS";
    baselineStep.detail = `Using ${baselineVersionId} (${baselineLabel})`;
  } catch (baselineError) {
    const message =
      baselineError instanceof Error ? baselineError.message : "Unable to determine baseline version.";
    baselineStep.status = "FAIL";
    baselineStep.detail = message;
    markEndpointFailure();
  }

  const createStep = summary[1];
  let jobCandidate = null;

  if (!baselineVersionId) {
    createStep.status = "SKIP";
    createStep.detail = "Baseline selection failed.";
  } else {
    jobCandidate = await resolveJobCandidate();
    if (!jobCandidate) {
      createStep.status = "SKIP";
      createStep.detail = "No job with a sourceUrl available.";
    } else {
      const payload = {
        baselineVersionId,
        sourceType: "GREENHOUSE",
        sourceUrl: jobCandidate.sourceUrl,
        sourceOptions: { maxListings: 5 },
        titlePatterns: ["verification smoke check"],
      };

      try {
        const { response, parsed, text, url } = await request(
          apiRoutes.searchSets,
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
          { json: true },
        );

        if (!response.ok) {
          const message = formatPayloadMessage(parsed, response.statusText || "Request failed");
          createStep.status = "FAIL";
          createStep.detail = `POST ${url} ${response.status} ${response.statusText}: ${message}`;
          markEndpointFailure();
        } else if (!parsed || typeof parsed !== "object" || typeof parsed.id !== "string") {
          createStep.status = "FAIL";
          createStep.detail = "Response missing search set id";
          markSchemaFailure();
        } else {
          const searchSetId = parsed.id;
          createStep.status = "PASS";
          createStep.detail = `Created search set ${searchSetId}; baseline selection assumed ${baselineVersionId}`;
        }
      } catch (createError) {
        createStep.status = "FAIL";
        createStep.detail = `Create request failed: ${
          createError instanceof Error ? createError.message : createError
        }`;
        markEndpointFailure();
      }
    }
  }

  const computeStep = summary[2];
  const computePath = apiRoutes.expandedFitCompute.replace(
    "{id}",
    encodeURIComponent(interviewRecordId),
  );

  try {
    const { response, parsed, text, url } = await request(
      computePath,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
      { json: true },
    );

    if (!response.ok) {
      const message = formatPayloadMessage(parsed, response.statusText || "Request failed");
      const normalizedMessage = (message || "").toLowerCase();
      if (
        response.status === 400 &&
        normalizedMessage.includes("no additions available for expanded scoring")
      ) {
        computeStep.status = "SKIP";
        computeStep.detail = "No additions available for expanded scoring; skip this compute.";
      } else {
        computeStep.status = "FAIL";
        computeStep.detail = `POST ${url} ${response.status} ${response.statusText}: ${message}`;
        markEndpointFailure();
      }
    } else {
      const score = hasExpandedScore(parsed);
      if (score === null) {
        computeStep.status = "FAIL";
        computeStep.detail = "Missing expandedFitScore in response payload.";
        markSchemaFailure();
      } else {
        computeStep.status = "PASS";
        computeStep.detail = `expandedFitScore=${score}`;
      }
    }
  } catch (computeError) {
    computeStep.status = "FAIL";
    computeStep.detail = `Request error: ${
      computeError instanceof Error ? computeError.message : computeError
    }`;
    markEndpointFailure();
  }

  console.log("\nSummary:");
  summary.forEach((entry) => {
    const detail = entry.detail ? ` - ${entry.detail}` : "";
    console.log(` - ${entry.label}: ${entry.status}${detail}`);
  });

  if (jobCandidate) {
    console.log(`${tag} Job used: ${jobCandidate.id} (${jobCandidate.title})`);
  }

  process.exitCode = exitCode;
})();
