import type { BaselineDto } from "@/lib/baselines";

export type BaselinePartition = {
  currentBaseline: BaselineDto | null;
  activeBaselines: BaselineDto[];
  libraryBaselines: BaselineDto[];
  archivedBaselines: BaselineDto[];
};

const sortBaselinesNewestFirst = (baselines: BaselineDto[]) =>
  [...baselines].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

export function partitionBaselines({
  baselines,
  currentBaselineId,
}: {
  baselines: BaselineDto[];
  currentBaselineId: string | null;
}): BaselinePartition {
  const sorted = sortBaselinesNewestFirst(baselines);
  const activeBaselines = sorted.filter((baseline) => baseline.status !== "ARCHIVED");
  const archivedBaselines = sorted.filter((baseline) => baseline.status === "ARCHIVED");

  const resolvedCurrentId =
    (currentBaselineId &&
    activeBaselines.some((baseline) => baseline.id === currentBaselineId)
      ? currentBaselineId
      : activeBaselines[0]?.id ?? null);

  const currentBaseline =
    resolvedCurrentId ? activeBaselines.find((baseline) => baseline.id === resolvedCurrentId) ?? null : null;

  const libraryBaselines = resolvedCurrentId
    ? activeBaselines.filter((baseline) => baseline.id !== resolvedCurrentId)
    : activeBaselines;

  return {
    currentBaseline,
    activeBaselines,
    libraryBaselines,
    archivedBaselines,
  };
}

