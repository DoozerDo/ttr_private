#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  classifyReferenceTarget,
  detectOrphanedRoutes,
  extractRouteReferencesFromSource,
  isDynamicRoute,
  toApiRouteFromHandlerFile,
  toRouteFromPageFile,
} from "./route-integrity-lib.js";

const ROOT_DIR = path.resolve(process.cwd(), "..", "..");
const WEB_DIR = path.resolve(process.cwd());
const APP_DIR = path.join(WEB_DIR, "app");
const APP_API_DIR = path.join(APP_DIR, "api");
const REPORTS_DIR = path.join(ROOT_DIR, "reports");
const REPORT_JSON = path.join(REPORTS_DIR, "route-integrity-report.json");
const REPORT_MD = path.join(REPORTS_DIR, "route-integrity-report.md");

const SOURCE_DIRS = [
  path.join(WEB_DIR, "app"),
  path.join(WEB_DIR, "components"),
  path.join(WEB_DIR, "src"),
  path.join(WEB_DIR, "lib"),
];

const STATIC_ENTRY_ROUTES = [
  "/",
  "/baseline",
  "/analyze",
  "/results",
  "/studio",
  "/target",
  "/opportunities",
  "/jobs",
];

const ORPHAN_EXCLUDE_PATTERNS = [
  /^\/auth/,
  /^\/api/,
  /^\/admin/,
  /^\/_not-found$/,
];

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

async function discoverRoutes() {
  const appFiles = await walkFiles(APP_DIR);
  const pageFiles = appFiles.filter((file) =>
    /page\.(tsx|ts|jsx|js|mdx)$/.test(file.replace(/\\/g, "/")),
  );
  const apiFiles = appFiles.filter((file) =>
    /\/api\/.+\/route\.(tsx|ts|jsx|js|mdx)$/.test(file.replace(/\\/g, "/")) ||
    /\/api\/route\.(tsx|ts|jsx|js|mdx)$/.test(file.replace(/\\/g, "/")),
  );

  const pageRoutes = [...new Set(pageFiles.map((file) => {
    const rel = path.relative(APP_DIR, file);
    return toRouteFromPageFile(rel);
  }))].sort();

  const apiRoutes = [...new Set(apiFiles.map((file) => {
    const rel = path.relative(APP_API_DIR, file);
    return toApiRouteFromHandlerFile(rel);
  }))].sort();

  return { pageFiles, apiFiles, pageRoutes, apiRoutes };
}

function isCodeFile(filePath) {
  return /\.(tsx|ts|jsx|js|mjs|cjs)$/.test(filePath);
}

async function discoverReferences() {
  const refs = [];
  for (const dir of SOURCE_DIRS) {
    let files = [];
    try {
      files = await walkFiles(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!isCodeFile(file)) continue;
      const text = await fs.readFile(file, "utf8");
      const extracted = extractRouteReferencesFromSource(text);
      for (const ref of extracted) {
        refs.push({
          ...ref,
          sourceFile: path.relative(ROOT_DIR, file).replace(/\\/g, "/"),
        });
      }
    }
  }
  return refs;
}

function statusToKind(status) {
  if (status === 404) return "404";
  if (status >= 500) return "500";
  if (status === 401 || status === 403) return "unauthorized";
  return "ok";
}

async function runRuntimePass({ baseUrl, authToken, mode, pageRoutes, apiTargets }) {
  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    return { skipped: true, mode, reason: "@playwright/test not installed" };
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl });
  if (authToken) {
    await context.addCookies([
      {
        name: "access_token",
        value: authToken,
        domain: new URL(baseUrl).hostname,
        path: "/",
        httpOnly: false,
        secure: false,
      },
    ]);
  }

  const page = await context.newPage();
  const pageChecks = [];
  const discoveredLinks = new Set();
  for (const route of pageRoutes) {
    try {
      const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 10000 });
      const status = response?.status() ?? 0;
      pageChecks.push({ route, status, kind: statusToKind(status), mode });
      const links = await page.$$eval("a[href]", (nodes) =>
        nodes.map((n) => n.getAttribute("href") ?? "").filter(Boolean),
      );
      for (const href of links) {
        if (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/#")) {
          discoveredLinks.add(href.split("?")[0].split("#")[0]);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pageChecks.push({
        route,
        status: 0,
        kind: /redirect/i.test(message) ? "redirect_loop" : "missing_target",
        mode,
      });
    }
  }

  const apiChecks = [];
  const uniqueApi = [...new Set(apiTargets)];
  for (const apiPath of uniqueApi) {
    try {
      const response = await context.request.fetch(apiPath, { method: "GET", timeout: 10000 });
      const status = response.status();
      apiChecks.push({ path: apiPath, status, kind: statusToKind(status), mode });
    } catch {
      apiChecks.push({ path: apiPath, status: 0, kind: "missing_target", mode });
    }
  }

  await context.close();
  await browser.close();
  return {
    skipped: false,
    mode,
    pageChecks,
    apiChecks,
    discoveredLinks: [...discoveredLinks].sort(),
  };
}

async function canReachBaseUrl(baseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(baseUrl, { method: "GET", signal: controller.signal });
    return response.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Route Integrity Report");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Page routes discovered: ${report.summary.pageRoutes}`);
  lines.push(`- API routes discovered: ${report.summary.apiRoutes}`);
  lines.push(`- Internal references discovered: ${report.summary.references}`);
  lines.push(`- Broken internal page references: ${report.summary.brokenPageRefs}`);
  lines.push(`- Broken API references: ${report.summary.brokenApiRefs}`);
  lines.push(`- Likely orphaned pages: ${report.summary.orphans}`);
  lines.push("");

  lines.push("## Broken Internal Page Links");
  lines.push("");
  if (!report.findings.brokenPageRefs.length) lines.push("- None");
  for (const item of report.findings.brokenPageRefs) {
    lines.push(
      `- Source \`${item.sourceFile}\` -> \`${item.target}\` (${item.classification.type})`,
    );
  }
  lines.push("");

  lines.push("## Broken API Links/Proxies Referenced by UI");
  lines.push("");
  if (!report.findings.brokenApiRefs.length) lines.push("- None");
  for (const item of report.findings.brokenApiRefs) {
    lines.push(
      `- Source \`${item.sourceFile}\` -> \`${item.target}\` (${item.classification.type})`,
    );
  }
  lines.push("");

  lines.push("## Orphaned Routes");
  lines.push("");
  if (!report.findings.orphans.length) lines.push("- None");
  for (const item of report.findings.orphans) {
    lines.push(`- ${item.route} (${item.classification})`);
  }
  lines.push("");

  lines.push("## Dynamic/Unresolved Targets");
  lines.push("");
  if (!report.findings.dynamicOrUnresolved.length) lines.push("- None");
  for (const item of report.findings.dynamicOrUnresolved) {
    lines.push(
      `- Source \`${item.sourceFile}\` -> \`${item.target}\` (${item.classification.type})`,
    );
  }
  lines.push("");

  lines.push("## Runtime Checks");
  lines.push("");
  if (!report.runtime.length) {
    lines.push("- Runtime scan skipped.");
  } else {
    for (const run of report.runtime) {
      if (run.skipped) {
        lines.push(`- ${run.mode}: skipped (${run.reason})`);
        continue;
      }
      lines.push(`### ${run.mode}`);
      lines.push("");
      const badPages = run.pageChecks.filter((x) => x.kind !== "ok");
      const badApis = run.apiChecks.filter((x) => x.kind !== "ok");
      lines.push(`- Page checks: ${run.pageChecks.length}, failures: ${badPages.length}`);
      lines.push(`- API checks: ${run.apiChecks.length}, failures: ${badApis.length}`);
      for (const p of badPages) lines.push(`- Page \`${p.route}\` -> ${p.kind} (${p.status})`);
      for (const a of badApis) lines.push(`- API \`${a.path}\` -> ${a.kind} (${a.status})`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

async function main() {
  const discovered = await discoverRoutes();
  const references = await discoverReferences();

  const classifiedRefs = references.map((ref) => ({
    ...ref,
    classification: classifyReferenceTarget(
      ref.target,
      discovered.pageRoutes,
      discovered.apiRoutes,
    ),
  }));

  const brokenPageRefs = classifiedRefs.filter(
    (x) => x.classification.type === "missing_page_route",
  );
  const brokenApiRefs = classifiedRefs.filter(
    (x) => x.classification.type === "missing_api_route",
  );
  const dynamicOrUnresolved = classifiedRefs.filter((x) =>
    ["dynamic_page_route", "dynamic_api_route"].includes(x.classification.type),
  );

  const referencedPageTargets = classifiedRefs
    .filter((x) => !x.target.startsWith("/api/"))
    .map((x) => x.target);

  const orphans = detectOrphanedRoutes(
    discovered.pageRoutes,
    [...new Set([...STATIC_ENTRY_ROUTES, ...referencedPageTargets])],
    {
      excludedRoutes: discovered.pageRoutes.filter((route) =>
        ORPHAN_EXCLUDE_PATTERNS.some((pattern) => pattern.test(route)),
      ),
    },
  );

  const apiTargets = classifiedRefs
    .filter((x) => x.target.startsWith("/api/"))
    .map((x) => x.target);

  const baseUrl = process.env.ROUTE_SCAN_BASE_URL ?? "http://localhost:3000";
  const runtime = [];
  const userToken = process.env.TTR_AUTH_TOKEN ?? "";
  const adminToken = process.env.TTR_ADMIN_AUTH_TOKEN ?? "";
  const reachable = await canReachBaseUrl(baseUrl);
  if (!reachable) {
    runtime.push(
      { skipped: true, mode: "user", reason: `Base URL unreachable: ${baseUrl}` },
    );
    if (adminToken) {
      runtime.push(
        { skipped: true, mode: "admin", reason: `Base URL unreachable: ${baseUrl}` },
      );
    }
  } else {
    runtime.push(
      await runRuntimePass({
        baseUrl,
        authToken: userToken,
        mode: "user",
        pageRoutes: discovered.pageRoutes.filter((r) => !isDynamicRoute(r)).slice(0, 60),
        apiTargets,
      }),
    );

    if (adminToken) {
      runtime.push(
        await runRuntimePass({
          baseUrl,
          authToken: adminToken,
          mode: "admin",
          pageRoutes: discovered.pageRoutes.filter((r) => !isDynamicRoute(r)).slice(0, 60),
          apiTargets,
        }),
      );
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    summary: {
      pageRoutes: discovered.pageRoutes.length,
      apiRoutes: discovered.apiRoutes.length,
      references: classifiedRefs.length,
      brokenPageRefs: brokenPageRefs.length,
      brokenApiRefs: brokenApiRefs.length,
      orphans: orphans.length,
    },
    inventory: {
      pageRoutes: discovered.pageRoutes,
      apiRoutes: discovered.apiRoutes,
      references: classifiedRefs,
    },
    findings: {
      brokenPageRefs,
      brokenApiRefs,
      dynamicOrUnresolved,
      orphans,
    },
    runtime,
  };

  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(REPORT_MD, renderMarkdown(report), "utf8");
  console.log(`[route-scan] Wrote ${path.relative(ROOT_DIR, REPORT_MD)}`);
  console.log(`[route-scan] Wrote ${path.relative(ROOT_DIR, REPORT_JSON)}`);
}

main().catch((error) => {
  console.error("[route-scan] failed", error);
  process.exitCode = 1;
});
