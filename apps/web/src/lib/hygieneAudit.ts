import fs from "node:fs/promises";
import path from "node:path";

import {
  formatHygieneSummaryText,
  normalizeRepoPath,
  type DeadCodeCandidate,
  type HygieneSnapshot,
  type RouteDriftCandidate,
  type HygieneSummary,
} from "./hygieneAudit.shared";

const EXCLUDED_DIR_NAMES = new Set(["node_modules", ".next", "dist", "build", "coverage", ".git", ".turbo", ".cache", "tmp", "temp", "logs"]);
const DEAD_CODE_PATTERNS = [/\.old\./i, /\.bak\./i, /\.copy\./i, /final-final/i, /prototype/i, /scratch/i, /temp/i, /tmp/i];
const ROUTE_REVIEW_SEGMENTS = ["legacy", "demo", "test", "experimental", "old", "archive"];

function nowIso(now = new Date()) {
  return now.toISOString();
}

async function walk(dir: string, files: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, files);
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function categorizeDeadCode(file: string) {
  if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) return "test";
  if (file.includes("/scripts/")) return "script";
  if (file.includes("/components/")) return "component";
  if (file.includes("/lib/") || file.includes("/utils/")) return "util";
  if (file.includes("/app/")) return "file";
  return "other";
}

function deadReason(pathName: string, ageDays: number, inbound: number) {
  const reasons: string[] = [];
  if (inbound === 0) reasons.push("not found in import graph");
  if (ageDays > 90) reasons.push("older than 90 days");
  if (DEAD_CODE_PATTERNS.some((pattern) => pattern.test(pathName))) reasons.push("legacy or temporary naming");
  return reasons.slice(0, 3);
}

export async function runHygieneAudit(repoRoot: string, now = new Date()): Promise<HygieneSnapshot> {
  const allFiles = await walk(repoRoot);
  const sourceFiles = allFiles.filter((file) => /\.(tsx?|jsx?|mjs|cjs)$/.test(file));
  const routeFiles = allFiles.filter((file) => /[/\\]app[/\\].*[/\\]page\.tsx$/.test(file));

  const sourceTextCache = new Map<string, string>();
  const readText = async (file: string) => {
    const cached = sourceTextCache.get(file);
    if (cached) return cached;
    const text = await fs.readFile(file, "utf8");
    sourceTextCache.set(file, text);
    return text;
  };

  const deadCandidates: DeadCodeCandidate[] = [];
  for (const file of sourceFiles) {
    const relative = normalizeRepoPath(path.relative(repoRoot, file));
    const text = await readText(file);
    const inbound = sourceFiles.filter((other) => other !== file && sourceTextCache.has(other) ? sourceTextCache.get(other)!.includes(relative) : false).length;
    const ageDays = Math.floor((now.getTime() - (await fs.stat(file)).mtimeMs) / 86_400_000);
    const reasons = deadReason(relative, ageDays, inbound);
    if (reasons.length) {
      const strong = inbound === 0 && ageDays > 90;
      deadCandidates.push({
        path: relative,
        ageDays,
        strength: strong ? "Strong review candidate" : "Review candidate",
        reasons,
        kind: categorizeDeadCode(relative),
        inboundReferenceCount: inbound,
        contextNote: inbound === 0 ? "not found in import graph" : null,
        extension: path.extname(relative) || "(none)",
      });
    }
  }

  const routeCandidates: RouteDriftCandidate[] = [];
  for (const file of routeFiles) {
    const relative = normalizeRepoPath(path.relative(repoRoot, file));
    const routePath = "/" + relative
      .replace(/^apps\/web\/app\//, "")
      .replace(/\/page\.tsx$/, "")
      .replace(/\/layout\.tsx$/, "")
      .replace(/\/route\.ts$/, "")
      .replace(/\(.*?\)\//g, "")
      .replace(/index$/, "");
    const ageDays = Math.floor((now.getTime() - (await fs.stat(file)).mtimeMs) / 86_400_000);
    const text = await readText(file);
    const discoveredInNav = sourceFiles.some((other) => sourceTextCache.get(other)?.includes(routePath));
    const reasons = [
      !discoveredInNav ? "no discovered internal links" : "",
      ageDays > 90 ? "older than 90 days" : "",
      ROUTE_REVIEW_SEGMENTS.some((segment) => routePath.includes(segment)) ? "legacy path pattern" : "",
    ].filter(Boolean);
    if (reasons.length) {
      const strong = !discoveredInNav && ageDays > 90;
      routeCandidates.push({
        path: routePath,
        ageDays,
        strength: strong ? "Strong review candidate" : "Review candidate",
        reasons,
        routePath,
        sourceFile: relative,
        discoveredInNav,
      });
    }
  }

  const buildSummary = <T extends { strength: string; reasons: string[] }>(items: T[]): HygieneSummary => ({
    totalCandidates: items.length,
    strongCandidates: items.filter((item) => item.strength === "Strong review candidate").length,
    byCategory: items.reduce<Record<string, number>>((acc, item) => {
      for (const reason of item.reasons) acc[reason] = (acc[reason] ?? 0) + 1;
      return acc;
    }, {}),
  });

  return {
    scannedAt: nowIso(now),
    deadCode: { summary: buildSummary(deadCandidates), candidates: deadCandidates },
    routes: { summary: buildSummary(routeCandidates), candidates: routeCandidates },
  };
}

export { formatHygieneSummaryText };
