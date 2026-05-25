#!/usr/bin/env node

function nowIso() {
  return new Date().toISOString();
}

function log(message, extra) {
  const payload = { timestamp: nowIso(), message, ...(extra ? { ...extra } : {}) };
  console.log(JSON.stringify(payload));
}

function normalizeBaseUrl({ key, rawValue }) {
  const candidate = rawValue == null ? "" : String(rawValue).trim();
  if (!candidate) {
    throw new Error(`${key} must be set`);
  }
  return candidate.replace(/\/+$/, "");
}

async function fetchJson(url) {
  const response = await fetch(url, { method: "GET" });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { response, json, text };
}

function classifyFailure(errOrStatus) {
  // "deploy window" / transient infrastructure failures we should gate on (skip)
  if (typeof errOrStatus === "number") {
    if ([502, 503, 504].includes(errOrStatus)) return { transient: true, reason: `http_${errOrStatus}` };
    if (errOrStatus === 521 || errOrStatus === 522 || errOrStatus === 523) return { transient: true, reason: `http_${errOrStatus}` };
    return { transient: false, reason: `http_${errOrStatus}` };
  }
  const msg = String(errOrStatus?.message ?? errOrStatus ?? "").toLowerCase();
  if (!msg) return { transient: true, reason: "unknown_error" };
  if (msg.includes("econnrefused")) return { transient: true, reason: "econnrefused" };
  if (msg.includes("enotfound")) return { transient: true, reason: "enotfound" };
  if (msg.includes("etimedout")) return { transient: true, reason: "etimedout" };
  if (msg.includes("networkerror") || msg.includes("fetch failed")) return { transient: true, reason: "fetch_failed" };
  return { transient: true, reason: "network_error" };
}

async function probeOnce({ apiUrl, webUrl }) {
  const apiStatusUrl = `${apiUrl}/status`;
  const webStatusUrl = `${webUrl}/api/status`;
  const webRootUrl = `${webUrl}/`;

  try {
    const [api, web, webRoot] = await Promise.all([
      fetchJson(apiStatusUrl),
      fetchJson(webStatusUrl),
      fetchJson(webRootUrl),
    ]);
    const apiOk = api.response.ok;
    const webOk = web.response.ok;
    const webRootOk = webRoot.response.ok;

    return {
      ok: apiOk && webOk && webRootOk,
      api: {
        url: apiStatusUrl,
        status: api.response.status,
        ok: apiOk,
        json: api.json,
      },
      web: {
        url: webStatusUrl,
        status: web.response.status,
        ok: webOk,
        json: web.json,
      },
      webRoot: {
        url: webRootUrl,
        status: webRoot.response.status,
        ok: webRootOk,
      },
      transient: classifyFailure(api.response.status).transient || classifyFailure(web.response.status).transient,
      reason: !apiOk
        ? `api_${api.response.status}`
        : !webOk
          ? `web_${web.response.status}`
          : !webRootOk
            ? `webroot_${webRoot.response.status}`
            : null,
    };
  } catch (error) {
    const classified = classifyFailure(error);
    return {
      ok: false,
      api: { url: apiStatusUrl, status: null, ok: false, json: null },
      web: { url: webStatusUrl, status: null, ok: false, json: null },
      webRoot: { url: webRootUrl, status: null, ok: false },
      transient: classified.transient,
      reason: classified.reason,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const apiUrl = normalizeBaseUrl({ key: "API_BASE_URL", rawValue: process.env.API_BASE_URL });
  const webUrl = normalizeBaseUrl({ key: "BASE_URL", rawValue: process.env.BASE_URL });

  const maxAttempts = Number.parseInt(process.env.HEALTH_GATE_MAX_ATTEMPTS || "20", 10);
  const baseDelayMs = Number.parseInt(process.env.HEALTH_GATE_DELAY_MS || "3000", 10);

  log("health-gate-start", { apiUrl, webUrl, maxAttempts, baseDelayMs });

  let last = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await probeOnce({ apiUrl, webUrl });
    last = result;
    if (result.ok) {
      const apiVersion = result.api?.json && typeof result.api.json === "object" ? result.api.json.version : null;
      const apiEnv = result.api?.json && typeof result.api.json === "object" ? result.api.json.env : null;
      const webVersion = result.web?.json && typeof result.web.json === "object" ? result.web.json.version : null;
      const webEnv = result.web?.json && typeof result.web.json === "object" ? result.web.json.env : null;

      log("health-gate-healthy", {
        attempt,
        api: result.api,
        web: result.web,
        webRoot: result.webRoot,
        marker: { apiVersion, apiEnv, webVersion, webEnv },
      });
      // Emit outputs for GitHub Actions via GITHUB_OUTPUT redirection.
      process.stdout.write(`healthy=true\n`);
      process.stdout.write(`reason=healthy\n`);
      if (apiVersion) process.stdout.write(`api_version=${String(apiVersion)}\n`);
      if (webVersion) process.stdout.write(`web_version=${String(webVersion)}\n`);
      if (apiEnv) process.stdout.write(`api_env=${String(apiEnv)}\n`);
      if (webEnv) process.stdout.write(`web_env=${String(webEnv)}\n`);
      return;
    }
    log("health-gate-wait", {
      attempt,
      ok: false,
      transient: result.transient,
      reason: result.reason,
      api: result.api,
      web: result.web,
    });
    const delayMs = Math.min(baseDelayMs * attempt, 15000);
    await sleep(delayMs);
  }

  // Not healthy in time: treat as "skipped" if it looks like a deploy window, otherwise unhealthy.
  const reason = last?.reason ?? "unhealthy";
  const transient = Boolean(last?.transient);
  log("health-gate-unhealthy", { transient, reason, api: last?.api, web: last?.web, error: last?.error ?? null });

  process.stdout.write(`healthy=false\n`);
  process.stdout.write(`reason=${transient ? "deploy_window" : "unhealthy"}:${reason}\n`);
}

main().catch((error) => {
  log("health-gate-error", { error: error instanceof Error ? error.message : String(error) });
  // Missing env / script error should fail the workflow (not a deploy-window skip).
  process.exitCode = 1;
});
