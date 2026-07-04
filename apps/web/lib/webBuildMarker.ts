export type WebBuildMarkerResolution = {
  marker: string;
  source: string | null;
  missing: boolean;
};

const normalizeBuildMarker = (value: string | undefined | null): string | null => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === "unknown") {
    return null;
  }
  return trimmed;
};

export function resolveWebBuildMarker(): WebBuildMarkerResolution {
  const candidates: Array<{ source: string; value: string | null }> = [
    { source: "NEXT_PUBLIC_GIT_SHA", value: normalizeBuildMarker(process.env.NEXT_PUBLIC_GIT_SHA) },
    {
      source: "NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA",
      value: normalizeBuildMarker(process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA),
    },
    {
      source: "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
      value: normalizeBuildMarker(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA),
    },
    { source: "NEXT_PUBLIC_COMMIT_SHA", value: normalizeBuildMarker(process.env.NEXT_PUBLIC_COMMIT_SHA) },
  ];

  const resolved = candidates.find((candidate) => Boolean(candidate.value));
  if (resolved?.value) {
    return {
      marker: resolved.value,
      source: resolved.source,
      missing: false,
    };
  }

  return {
    marker: "unknown",
    source: null,
    missing: process.env.NODE_ENV === "production",
  };
}
