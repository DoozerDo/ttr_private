const normalizeBuildMarker = (value: string | undefined | null): string | null => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === "unknown") {
    return null;
  }
  return trimmed;
};

export function resolveWebBuildMarker(): string {
  const marker =
    normalizeBuildMarker(process.env.NEXT_PUBLIC_GIT_SHA) ??
    normalizeBuildMarker(process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA) ??
    normalizeBuildMarker(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA) ??
    normalizeBuildMarker(process.env.NEXT_PUBLIC_COMMIT_SHA);

  if (marker) {
    return marker;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Missing production web build marker. Set NEXT_PUBLIC_GIT_SHA or provide the deployed commit SHA via platform build metadata.",
    );
  }

  return "unknown";
}
