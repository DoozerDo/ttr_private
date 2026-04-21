import fs from "node:fs";
import path from "node:path";

function walkFiles(dir: string, predicate: (file: string) => boolean): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, predicate));
      continue;
    }
    if (entry.isFile() && predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function normalizeSlashes(value: string) {
  return value.replace(/\\/g, "/");
}

function listBaselineRoutePatterns(repoRoot: string) {
  const baselinesApiDir = path.join(repoRoot, "apps/web/app/api/baselines");
  const routeFiles = walkFiles(baselinesApiDir, (file) =>
    file.endsWith(`${path.sep}route.ts`),
  );

  // Convert route.ts file locations into stable patterns for comparison.
  return new Set(
    routeFiles.map((file) => {
      const rel = normalizeSlashes(path.relative(baselinesApiDir, file));
      if (rel === "route.ts") return "/api/baselines";
      const withoutRoute = rel.replace(/\/route\.ts$/, "");
      // Next segment names map to URL path.
      return `/api/baselines/${withoutRoute.replace("[baselineId]", ":baselineId")}`;
    }),
  );
}

type RequiredRoute =
  | "/api/baselines"
  | "/api/baselines/analyze"
  | "/api/baselines/:baselineId"
  | `/api/baselines/:baselineId/${string}`;

function discoverBaselineApiUsage(repoRoot: string) {
  const candidates: string[] = [];
  const appDir = path.join(repoRoot, "apps/web/app");
  const srcDir = path.join(repoRoot, "apps/web/src");
  const libDir = path.join(repoRoot, "apps/web/lib");

  const isSourceFile = (file: string) =>
    (file.endsWith(".ts") || file.endsWith(".tsx")) &&
    !file.endsWith(".d.ts") &&
    !normalizeSlashes(file).includes("/apps/web/app/api/");

  candidates.push(...walkFiles(appDir, isSourceFile));
  candidates.push(...walkFiles(srcDir, isSourceFile));
  candidates.push(...walkFiles(libDir, isSourceFile));

  const required = new Set<RequiredRoute>();
  const unknownActions: Array<{ file: string; action: string }> = [];

  const ensureRoot = () => required.add("/api/baselines");
  const ensureAnalyze = () => required.add("/api/baselines/analyze");
  const ensureBaselineId = () => required.add("/api/baselines/:baselineId");
  const ensureBaselineAction = (action: string) =>
    required.add(`/api/baselines/:baselineId/${action}` as RequiredRoute);

  for (const file of candidates) {
    const content = fs.readFileSync(file, "utf8");
    if (!content.includes("/api/baselines")) continue;

    // Root endpoints (including query params)
    const rootMatches = content.match(/["'`]\/api\/baselines(\?[^"'`]*)?["'`]/g);
    if (rootMatches?.length) {
      ensureRoot();
    }

    // Non-ID singleton endpoints under /baselines (currently only /analyze)
    const analyzeMatches = content.match(/["'`]\/api\/baselines\/analyze["'`]/g);
    if (analyzeMatches?.length) {
      ensureAnalyze();
    }

    // Detail endpoints with a dynamic baseline id.
    const idTemplateMatches = Array.from(
      content.matchAll(
        /\/api\/baselines\/\$\{[^}]+\}(?:\/([a-z-]+(?:\/[a-z-]+)?))?/g,
      ),
    );
    const idEncodeMatches = Array.from(
      content.matchAll(
        /\/api\/baselines\/\$\{encodeURIComponent\([^}]+\)\}(?:\/([a-z-]+(?:\/[a-z-]+)?))?/g,
      ),
    );
    const idMatches = idTemplateMatches.concat(idEncodeMatches);

    if (idMatches.length) {
      ensureBaselineId();
    }

    for (const match of idMatches) {
      const action = match[1] ?? "";
      if (!action) continue;

      // Allow nested actions like fit-review/clone.
      const normalizedAction = action.trim();
      ensureBaselineAction(normalizedAction);
    }

    // Also allow static ids in server-side code (rare), but only if the next path segment maps to a known action.
    for (const match of content.matchAll(/\/api\/baselines\/([A-Za-z0-9_-]+)(?:\/([a-z-]+(?:\/[a-z-]+)?))?/g)) {
      const maybeId = match[1] ?? "";
      const maybeAction = match[2] ?? "";
      if (!maybeId) continue;
      ensureBaselineId();
      if (maybeAction) {
        ensureBaselineAction(maybeAction);
      }
    }
  }

  // Validate that the actions we discovered are actually routable.
  const knownIdActions = new Set([
    "analysis-score",
    "archive",
    "blocks",
    "current",
    "delete",
    "fit-review/clone",
    "reparse",
    "restore",
    "strengthening-additions",
    "versions",
  ]);

  for (const route of required) {
    if (!route.startsWith("/api/baselines/:baselineId/")) continue;
    const action = route.replace("/api/baselines/:baselineId/", "");
    if (!knownIdActions.has(action)) {
      unknownActions.push({ file: "<discovered>", action });
    }
  }

  return { required, unknownActions };
}

describe("baseline Next API route parity", () => {
  it("has a Next proxy route for every discovered /api/baselines endpoint usage", () => {
    // Vitest runs with CWD at `apps/web` in this repo.
    const cwd = process.cwd();
    const repoRoot = fs.existsSync(path.join(cwd, "app")) && fs.existsSync(path.join(cwd, "tests"))
      ? path.resolve(cwd, "../..")
      : cwd;
    const existing = listBaselineRoutePatterns(repoRoot);
    const { required, unknownActions } = discoverBaselineApiUsage(repoRoot);

    if (unknownActions.length) {
      const actions = [...new Set(unknownActions.map((entry) => entry.action))].sort();
      throw new Error(
        `Discovered unknown baseline action(s) without an allowlisted route: ${actions.join(", ")}`,
      );
    }

    const missing = [...required].filter((route) => !existing.has(route)).sort();
    if (missing.length) {
      throw new Error(
        `Missing Next baseline route(s):\n${missing.map((route) => `- ${route}`).join("\n")}`,
      );
    }
  });
});
