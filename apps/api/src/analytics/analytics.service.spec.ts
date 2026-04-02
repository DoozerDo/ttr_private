import { AnalyticsService } from "./analytics.service";

type QueryOutcome = {
  rawOne?: Record<string, unknown>;
  rawMany?: Array<Record<string, unknown>>;
};

function createQueryBuilderMock(outcomes: QueryOutcome[]) {
  let index = 0;
  const builder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(async () => (outcomes[index++]?.rawOne ?? null) as Record<string, unknown> | null),
    getRawMany: jest.fn(async () => (outcomes[index++]?.rawMany ?? []) as Array<Record<string, unknown>>),
  };
  return builder;
}

function repoMock(outcomes: QueryOutcome[]) {
  const builder = createQueryBuilderMock(outcomes);
  return {
    createQueryBuilder: jest.fn(() => builder),
  } as any;
}

describe("AnalyticsService summary", () => {
  it("includes the new Results and Studio conversion signals", async () => {
    const analyticsRepo = repoMock([
      { rawOne: { count: "10" } },
      { rawOne: { count: "8" } },
      { rawOne: { count: "6" } },
      { rawOne: { count: "3" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "1" } },
      { rawOne: { count: "4" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "5" } },
      { rawOne: { count: "3" } },
      { rawOne: { count: "1" } },
      { rawMany: [] },
    ]);

    const service = new AnalyticsService(
      analyticsRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const summary = await service.getSummary(30);

    expect(summary.resultsImprovementModuleViews).toBe(4);
    expect(summary.resultsImprovementCtaClicks).toBe(2);
    expect(summary.artifactUsedIntents).toBe(5);
    expect(summary.artifactRefineIntents).toBe(3);
    expect(summary.opportunityCommitIntents).toBe(1);
    expect(summary.resultsImprovementCtaRate).toBeCloseTo(0.5);
    expect(summary.artifactToOpportunityCommitRate).toBeCloseTo(0.2);
    expect(summary.refineIntentShare).toBeCloseTo(0.75);
  });
});
