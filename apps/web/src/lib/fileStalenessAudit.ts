import fs from "node:fs/promises";
import path from "node:path";

import type {
  FileStalenessAuditOptions,
  FileStalenessRecord,
  FileStalenessAuditResult,
  FileStalenessAuditSummary,
} from "./fileStalenessAudit.shared";
import { classifyFileAge } from "./fileStalenessAudit.shared";

export {
  classifyFileAge,
  getAuditReminderStatus,
  getCandidateReason,
  getCandidateTag,
  getLikelyCleanupCandidates,
  matchesAuditQuery,
  buildFileStalenessAuditSummaryText,
  buildPersistedSnapshot,
  getUniqueExtensions,
  type AuditReminderStatus,
  type FileStalenessAuditOptions,
  type FileStalenessAuditResult,
  type FileStalenessAuditSummary,
  type FileStalenessBucket,
  type FileStalenessRecord,
  type PersistedFileStalenessAuditSnapshot,
} from "./fileStalenessAudit.shared";

const EXCLUDED_DIR_NAMES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".cache",
  "build",
  "coverage",
  "dist",
  "logs",
  "node_modules",
  "temp",
  "tmp",
]);

const EXCLUDED_FILE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

function normalizeRelativePath(input: string) {
  return input.split(path.sep).join("/");
}

function isEnvFile(fileName: string) {
  return fileName === ".env" || fileName.startsWith(".env.");
}

function isExcludedEntry(entryName: string, entryPath: string) {
  if (EXCLUDED_DIR_NAMES.has(entryName)) return true;
  if (EXCLUDED_FILE_NAMES.has(entryName)) return true;
  if (entryPath.includes(`${path.sep}.git${path.sep}`)) return true;
  if (entryPath.includes(`${path.sep}node_modules${path.sep}`)) return true;
  return false;
}

function safeRelativePath(repoRoot: string, targetPath: string) {
  const relative = path.relative(repoRoot, targetPath);
  return normalizeRelativePath(relative);
}

function withinRepoRoot(repoRoot: string, candidate: string) {
  const relative = path.relative(repoRoot, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function walkDirectory(
  repoRoot: string,
  dir: string,
  nowMs: number,
  records: FileStalenessRecord[],
  excludedPaths: string[],
  maxDepth: number,
  depth: number,
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relative = safeRelativePath(repoRoot, fullPath);
    if (!withinRepoRoot(repoRoot, fullPath) || isExcludedEntry(entry.name, fullPath)) {
      excludedPaths.push(relative);
      continue;
    }

    if (entry.isDirectory()) {
      if (depth >= maxDepth) {
        excludedPaths.push(relative);
        continue;
      }
      await walkDirectory(repoRoot, fullPath, nowMs, records, excludedPaths, maxDepth, depth + 1);
      continue;
    }

    if (!entry.isFile() && !entry.isSymbolicLink()) {
      excludedPaths.push(relative);
      continue;
    }

    const fileName = entry.name;
    const isEnv = isEnvFile(fileName);
    const kind: FileStalenessRecord["kind"] = isEnv ? "env" : "file";

    try {
      const stats = await fs.stat(fullPath);
      if (!stats.isFile()) {
        excludedPaths.push(relative);
        continue;
      }

      const ageDays = Math.max(0, Math.floor((nowMs - stats.mtimeMs) / 86_400_000));
      const bucket = classifyFileAge(ageDays);
      records.push({
        relativePath: relative,
        lastModifiedAt: new Date(stats.mtimeMs).toISOString(),
        ageDays,
        bucket,
        extension: path.extname(fileName).toLowerCase() || (isEnv ? ".env" : "(none)"),
        kind,
        sizeBytes: isEnv ? null : stats.size,
      });
    } catch {
      excludedPaths.push(relative);
    }
  }
}

export async function runFileStalenessAudit(
  repoRoot: string,
  options: FileStalenessAuditOptions = {},
): Promise<FileStalenessAuditResult> {
  const now = options.now ?? new Date();
  const maxDepth = options.maxDepth ?? 8;
  const records: FileStalenessRecord[] = [];
  const excludedPaths: string[] = [];

  await walkDirectory(repoRoot, repoRoot, now.getTime(), records, excludedPaths, maxDepth, 0);

  const summary: FileStalenessAuditSummary = {
    active: records.filter((record) => record.bucket === "ACTIVE").length,
    dormant: records.filter((record) => record.bucket === "DORMANT").length,
    stale: records.filter((record) => record.bucket === "STALE").length,
    cold: records.filter((record) => record.bucket === "COLD").length,
    totalScanned: records.length,
    totalExcluded: excludedPaths.length,
  };

  records.sort((left, right) => right.ageDays - left.ageDays || left.relativePath.localeCompare(right.relativePath));

  return {
    scannedAt: now.toISOString(),
    repoRoot,
    summary,
    records,
    excludedPaths,
  };
}
