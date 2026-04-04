export type FileStalenessBucket = "ACTIVE" | "DORMANT" | "STALE" | "COLD";

export type FileStalenessRecord = {
  relativePath: string;
  lastModifiedAt: string;
  ageDays: number;
  bucket: FileStalenessBucket;
  extension: string;
  kind: "file" | "env" | "other";
  sizeBytes: number | null;
};

export type FileStalenessAuditSummary = {
  active: number;
  dormant: number;
  stale: number;
  cold: number;
  totalScanned: number;
  totalExcluded: number;
};

export type FileStalenessAuditResult = {
  scannedAt: string;
  repoRoot: string;
  summary: FileStalenessAuditSummary;
  records: FileStalenessRecord[];
  excludedPaths: string[];
};

export type PersistedFileStalenessAuditSnapshot = {
  lastAuditRunAt: string;
  repoRoot: string;
  summary: FileStalenessAuditSummary;
  likelyCleanupCandidates: number;
};

export type FileStalenessAuditOptions = {
  now?: Date;
  maxDepth?: number;
};

export type AuditReminderStatus = "healthy" | "due_soon" | "overdue" | "first_run";
type CandidateTag = "Review candidate" | "Strong review candidate";
export type HygieneInsight = {
  label: string;
  detail: string;
};

export function classifyFileAge(ageDays: number): FileStalenessBucket {
  if (ageDays <= 30) return "ACTIVE";
  if (ageDays <= 60) return "DORMANT";
  if (ageDays <= 90) return "STALE";
  return "COLD";
}

export function getAuditReminderStatus(daysSinceLastRun: number | null): AuditReminderStatus {
  if (daysSinceLastRun === null) return "first_run";
  if (daysSinceLastRun <= 30) return "healthy";
  if (daysSinceLastRun <= 44) return "due_soon";
  return "overdue";
}

export function getDaysSinceLastAudit(lastAuditRunAt: string | null | undefined, now = new Date()) {
  if (!lastAuditRunAt) return null;
  const parsed = new Date(lastAuditRunAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 86_400_000));
}

export function getHygieneInsight(summary: Pick<FileStalenessAuditSummary, "stale" | "cold">): HygieneInsight {
  if (summary.cold >= 25) {
    return {
      label: "High cleanup opportunity",
      detail: `${summary.cold} cold files detected`,
    };
  }
  if (summary.cold > 0) {
    return {
      label: "Moderate drift",
      detail: `${summary.stale} stale files, review recommended`,
    };
  }
  if (summary.stale > 0) {
    return {
      label: "Light drift",
      detail: `${summary.stale} stale files, worth a monthly pass`,
    };
  }
  return {
    label: "Audit clean",
    detail: "no cold files detected",
  };
}

export function getFileStalenessHygieneStatus(
  snapshot: PersistedFileStalenessAuditSnapshot | null,
  now = new Date(),
) {
  const daysSinceLastRun = getDaysSinceLastAudit(snapshot?.lastAuditRunAt ?? null, now);
  const reminderStatus = getAuditReminderStatus(daysSinceLastRun);
  const insight = getHygieneInsight(
    snapshot?.summary ?? {
      active: 0,
      dormant: 0,
      stale: 0,
      cold: 0,
      totalScanned: 0,
      totalExcluded: 0,
    },
  );
  return { daysSinceLastRun, reminderStatus, insight };
}

export function matchesAuditQuery(record: Pick<FileStalenessRecord, "relativePath" | "extension">, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const pathParts = record.relativePath.toLowerCase().split("/");
  return (
    record.relativePath.toLowerCase().includes(normalized) ||
    pathParts.some((part) => part.includes(normalized)) ||
    record.relativePath.split("/").pop()?.toLowerCase().includes(normalized) ||
    record.extension.toLowerCase().includes(normalized)
  );
}

export function buildFileStalenessAuditSummaryText(result: Pick<FileStalenessAuditResult, "scannedAt" | "summary"> & { candidatesCount: number }) {
  return [
    "File Staleness Audit",
    `Run: ${result.scannedAt}`,
    `Scanned: ${result.summary.totalScanned}`,
    `Excluded: ${result.summary.totalExcluded}`,
    `Active: ${result.summary.active}`,
    `Dormant: ${result.summary.dormant}`,
    `Stale: ${result.summary.stale}`,
    `Cold: ${result.summary.cold}`,
    `Likely cleanup candidates: ${result.candidatesCount}`,
  ].join("\n");
}

export function buildPersistedSnapshot(result: FileStalenessAuditResult): PersistedFileStalenessAuditSnapshot {
  return {
    lastAuditRunAt: result.scannedAt,
    repoRoot: result.repoRoot,
    summary: result.summary,
    likelyCleanupCandidates: getLikelyCleanupCandidates(result.records).length,
  };
}

export function getUniqueExtensions(records: FileStalenessRecord[]) {
  return [...new Set(records.map((record) => record.extension).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

const CANDIDATE_SEGMENTS = [
  "ad hoc",
  "backups",
  "archive",
  "exports",
  "final-final",
  "draft",
  "misc",
  "legacy",
  "notes",
  "output",
  "prototype",
  "scratch",
  "scripts",
  "temp",
  "tmp",
];

function isLikelyCleanupCandidate(record: FileStalenessRecord) {
  if (record.bucket !== "COLD") return false;
  const lower = record.relativePath.toLowerCase();
  return (
    CANDIDATE_SEGMENTS.some((segment) =>
      lower.includes(`/${segment}/`) ||
      lower.startsWith(`${segment}/`) ||
      lower.includes(`/${segment}.`) ||
      lower.includes(`-${segment}`) ||
      lower.includes(`_${segment}`)
    ) ||
    /\.(md|txt|json|yaml|yml|ps1|sh|mjs|cjs|ts|tsx|js|jsx|csv|log|sql|zip)$/i.test(lower)
  );
}

export function getCandidateReason(record: FileStalenessRecord) {
  const parts: string[] = [];
  if (record.ageDays > 90) parts.push("Older than 90 days");
  if (record.relativePath.toLowerCase().includes("/scripts/")) parts.push("lives in scripts");
  if (record.relativePath.toLowerCase().includes("/docs/")) parts.push("lives in docs");
  if (record.relativePath.toLowerCase().includes("/archive/")) parts.push("lives in archive");
  if (record.relativePath.toLowerCase().includes("/notes")) parts.push("notes path");
  if (record.relativePath.toLowerCase().includes("/tmp") || record.relativePath.toLowerCase().includes("/temp")) {
    parts.push("temporary path");
  }
  if (/\b(copy|backup|old|tmp|temp|draft|final-final|unused|archive)\b/i.test(record.relativePath)) {
    parts.push("leftover-style filename");
  }
  if (record.kind === "env") parts.push("env-adjacent file");
  if (/\.(md|txt|json|yaml|yml|ps1|sh|mjs|cjs|ts|tsx|js|jsx|csv|log|sql|zip)$/i.test(record.extension)) {
    parts.push("common review file type");
  }
  return parts.slice(0, 3).join(" and ");
}

export function getCandidateTag(record: FileStalenessRecord): CandidateTag | null {
  if (!isLikelyCleanupCandidate(record)) return null;
  const strongSignals =
    record.ageDays > 180 ||
    /(?:copy|backup|old|tmp|temp|draft|final-final|unused|archive)/i.test(record.relativePath) ||
    record.relativePath.toLowerCase().includes("/prototype/") ||
    record.relativePath.toLowerCase().includes("/legacy/") ||
    record.relativePath.toLowerCase().includes("/scratch/");
  return strongSignals ? "Strong review candidate" : "Review candidate";
}

export function getLikelyCleanupCandidates(records: FileStalenessRecord[]) {
  return records.filter(isLikelyCleanupCandidate);
}
