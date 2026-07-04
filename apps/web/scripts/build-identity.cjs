const { execSync } = require("node:child_process");

function normalizeBuildSha(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || trimmed.toLowerCase() === "unknown") {
    return null;
  }
  return trimmed;
}

function resolveBuildSha(execFn = execSync) {
  const envCandidates = [
    { source: "GIT_SHA", value: normalizeBuildSha(process.env.GIT_SHA) },
    { source: "NEXT_PUBLIC_GIT_SHA", value: normalizeBuildSha(process.env.NEXT_PUBLIC_GIT_SHA) },
    {
      source: "RAILWAY_GIT_COMMIT_SHA",
      value: normalizeBuildSha(process.env.RAILWAY_GIT_COMMIT_SHA),
    },
    {
      source: "NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA",
      value: normalizeBuildSha(process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA),
    },
    {
      source: "VERCEL_GIT_COMMIT_SHA",
      value: normalizeBuildSha(process.env.VERCEL_GIT_COMMIT_SHA),
    },
    {
      source: "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
      value: normalizeBuildSha(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA),
    },
    { source: "COMMIT_SHA", value: normalizeBuildSha(process.env.COMMIT_SHA) },
    { source: "NEXT_PUBLIC_COMMIT_SHA", value: normalizeBuildSha(process.env.NEXT_PUBLIC_COMMIT_SHA) },
  ];

  const fromEnv = envCandidates.find((candidate) => candidate.value);
  if (fromEnv?.value) {
    return { sha: fromEnv.value, source: fromEnv.source, resolvedFrom: "env" };
  }

  try {
    const gitSha = execFn("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const normalizedGitSha = normalizeBuildSha(gitSha);
    if (normalizedGitSha) {
      return { sha: normalizedGitSha, source: "git rev-parse HEAD", resolvedFrom: "git" };
    }
  } catch {
    // Fall through to the explicit failure below.
  }

  throw new Error(
    "Unable to resolve web build SHA. Provide GIT_SHA or build from a git checkout before deploying production.",
  );
}

module.exports = {
  normalizeBuildSha,
  resolveBuildSha,
};
