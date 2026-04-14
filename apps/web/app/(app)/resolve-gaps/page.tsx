import { redirect } from "next/navigation";

import { getFitReviewHref } from "@/src/navigation/routes";

type SearchParamsShape = Record<string, string | string[] | undefined>;

type ResolveGapsPageProps = {
  searchParams?: SearchParamsShape | Promise<SearchParamsShape>;
};

function resolveParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null;
  }

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildRedirectSearchParams(params: SearchParamsShape): URLSearchParams {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      const first = resolveParam(value);
      if (first) next.set(key, first);
      continue;
    }

    const resolved = resolveParam(value);
    if (resolved) {
      next.set(key, resolved);
    }
  }

  return next;
}

export default async function ResolveGapsPage({ searchParams }: ResolveGapsPageProps) {
  const params = (await Promise.resolve(searchParams ?? {})) as SearchParamsShape;
  const nextParams = buildRedirectSearchParams(params);

  redirect(
    getFitReviewHref(
      Object.fromEntries(nextParams.entries()) as {
        baselineId?: string | null;
        jobId?: string | null;
        baselineVersionId?: string | null;
        assessmentId?: string | null;
        analysisId?: string | null;
        highlightClaim?: string | null;
        locked?: boolean | number | string | null;
      },
    ),
  );
}
