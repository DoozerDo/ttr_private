import { AnalyticsService } from "./analytics.service";

type QueryOutcome = {
  rawOne?: Record<string, unknown>;
  rawMany?: Array<Record<string, unknown>>;
};

function queryBuilderFor(outcome: QueryOutcome) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(async () => (outcome.rawOne ?? null) as Record<string, unknown> | null),
    getRawMany: jest.fn(async () => (outcome.rawMany ?? []) as Array<Record<string, unknown>>),
  };
}

function buildService(outcomes: QueryOutcome[]) {
  let index = 0;
  const repo = {
    createQueryBuilder: jest.fn(() => queryBuilderFor(outcomes[index++] ?? {})),
  } as any;
  const snapshotRepo = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn(async (input: Record<string, unknown>) => ({
      ...input,
      id: 'snapshot-1',
      createdAt: new Date('2026-04-02T12:00:00.000Z'),
    })),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
  } as any;
  return new AnalyticsService(
    repo,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    snapshotRepo,
  );
}

function buildServiceWithSnapshots(outcomes: QueryOutcome[]) {
  let index = 0;
  const repo = {
    createQueryBuilder: jest.fn(() => queryBuilderFor(outcomes[index++] ?? {})),
  } as any;
  const snapshotRepo = {
    create: jest.fn((input: Record<string, unknown>) => input),
    save: jest.fn(async (input: Record<string, unknown>) => ({
      ...input,
      id: 'snapshot-1',
      createdAt: new Date('2026-04-02T12:00:00.000Z'),
    })),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
  } as any;
  const service = new AnalyticsService(
    repo,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    snapshotRepo,
  );
  return { service, snapshotRepo };
}

function baseOutcomes(overrides: QueryOutcome[]) {
  return [
    { rawOne: { count: "10" } },
    { rawOne: { count: "8" } },
    { rawOne: { count: "6" } },
    { rawOne: { count: "3" } },
    { rawOne: { count: "2" } },
    { rawOne: { count: "0" } },
    ...overrides,
    { rawMany: [] },
    { rawOne: { count: "8" } },
    { rawOne: { count: "4" } },
    { rawOne: { count: "2" } },
    { rawOne: { count: "1" } },
    { rawOne: { count: "1" } },
  ];
}

describe("AnalyticsService summary", () => {
  it("identifies module view to CTA as the weakest step with high severity and confidence", async () => {
    const service = buildService(
      baseOutcomes([
        { rawOne: { count: "100" } }, // module views current
        { rawOne: { count: "0" } }, // cta clicks current
        { rawOne: { count: "60" } }, // artifact used current
        { rawOne: { count: "50" } }, // artifact refine current
        { rawOne: { count: "50" } }, // opportunity commit current
      ]),
    );

    const summary = await service.getSummary(30);

    expect(summary.weakestStep).toMatchObject({
      weakestStepKey: "moduleViewToCtaRate",
      weakestStepLabel: "Results improvement module to CTA",
      weakestStepNumerator: 0,
      weakestStepDenominator: 100,
      weakestStepRate: 0,
      benchmarkStepRate: 0.8333333333333334,
      relativeDrop: 0.8333333333333334,
      severity: "High",
      confidence: "High",
      confidenceReason: "Based on strong current-period volume",
      watchlistStatus: "action_needed",
      watchlistPriority: "high",
      watchlistReason: "This bottleneck is severe, supported by meaningful volume, and is not improving.",
      recommendationTitle: "Improve Results CTA conversion",
    });
    expect(summary.recommendedNextAction).toMatchObject({
      actionTitle: "Improve Results CTA clarity",
      actionBody:
        "Simplify CTA copy, reduce competing actions, and test a single clear next step from Results. Recent product changes in this area may be contributing. Review recent releases before making additional changes.",
      actionFocus: "results_cta",
      actionSource: "weakest_step_with_release_context",
    });
    expect(summary.operatorSummary).toMatchObject({
      tone: "urgent",
      primaryFocus: "weak_step_action",
      headline: "Action needed: Results improvement module to CTA is the main funnel bottleneck right now.",
      subheadline: "The current weakest step is severe, supported by meaningful volume, and is not improving.",
      supportingReason: "Combine the weakest-step recommendation with release context to investigate likely causes.",
      recommendedActionTitle: "Improve Results CTA clarity",
    });
    expect(summary.adminSummaryExport).toMatchObject({
      headline: summary.operatorSummary.headline,
      tone: "urgent",
      primaryFocus: "weak_step_action",
      weakestStepLabel: "Results improvement module to CTA",
      weakestStepRate: 0,
      weakestStepDirection: "worsening",
      watchlistStatus: "action_needed",
      watchlistPriority: "high",
      severity: "High",
      confidence: "High",
      recommendedActionTitle: "Improve Results CTA clarity",
      recommendedActionBody:
        "Simplify CTA copy, reduce competing actions, and test a single clear next step from Results. Recent product changes in this area may be contributing. Review recent releases before making additional changes.",
      releaseContextSummary: "Recent relevant product changes exist in the current comparison window.",
    });
    expect(summary.exportMetadata.selectedWindowDays).toBe(30);
    expect(summary.exportMetadata.exportedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(summary.formattedExports.plainTextBrief).toContain("Product Signal Summary");
    expect(summary.formattedExports.plainTextBrief).toContain("Window: last 30 days");
    expect(summary.formattedExports.plainTextBrief).toContain("Weakest step: Results improvement module to CTA");
    expect(summary.formattedExports.plainTextBrief).toContain("Recommended action: Improve Results CTA clarity");
    expect(() => JSON.parse(summary.formattedExports.jsonPayload)).not.toThrow();
    expect(JSON.parse(summary.formattedExports.jsonPayload)).toMatchObject({
      exportedAt: summary.exportMetadata.exportedAt,
      selectedWindowDays: 30,
      headline: summary.operatorSummary.headline,
      tone: "urgent",
      primaryFocus: "weak_step_action",
      weakestStepLabel: "Results improvement module to CTA",
      weakestStepRate: 0,
      weakestStepDirection: "worsening",
      watchlistStatus: "action_needed",
      watchlistPriority: "high",
      severity: "High",
      confidence: "High",
      recommendedActionTitle: "Improve Results CTA clarity",
      recommendedActionBody:
        "Simplify CTA copy, reduce competing actions, and test a single clear next step from Results. Recent product changes in this area may be contributing. Review recent releases before making additional changes.",
      releaseContextSummary: "Recent relevant product changes exist in the current comparison window.",
    });
  });

  it("identifies artifact commit as the weakest step with medium severity and confidence", async () => {
    const service = buildService(
      baseOutcomes([
        { rawOne: { count: "20" } }, // module views current
        { rawOne: { count: "20" } }, // cta clicks current
        { rawOne: { count: "20" } }, // artifact used current
        { rawOne: { count: "20" } }, // artifact refine current
        { rawOne: { count: "16" } }, // opportunity commit current
      ]),
    );

    const summary = await service.getSummary(30);

    expect(summary.weakestStep).toMatchObject({
      weakestStepKey: "artifactToCommitRate",
      weakestStepLabel: "Artifact intent to opportunity commit",
      weakestStepNumerator: 16,
      weakestStepDenominator: 20,
      weakestStepRate: 0.8,
      benchmarkStepRate: 1,
      relativeDrop: 0.19999999999999996,
      severity: "Medium",
      confidence: "Medium",
      confidenceReason: "Based on moderate current-period volume",
      watchlistStatus: "monitor",
      watchlistPriority: "medium",
      watchlistReason: "This bottleneck shows enough risk to monitor closely.",
      recommendationTitle: "Improve opportunity capture",
    });
    expect(summary.recommendedNextAction).toMatchObject({
      actionTitle: "Improve opportunity capture visibility",
      actionBody:
        "Make the opportunity action more prominent and tie it directly to artifact completion moments.",
      actionFocus: "opportunity_capture",
      actionSource: "weakest_step",
    });
    expect(summary.operatorSummary).toMatchObject({
      tone: "informative",
      primaryFocus: "positive_recovery",
      headline: "The current weakest step is improving, but it remains the main funnel constraint.",
      subheadline:
        "The bottleneck is recovering relative to the prior period, which lowers urgency but does not remove the constraint.",
      supportingReason: "Keep monitoring the weakest step until the gap versus stronger steps narrows further.",
      recommendedActionTitle: "Improve opportunity capture visibility",
    });
  });

  it("returns a low-confidence weakest step when the denominator is small", async () => {
    const service = buildService(
      baseOutcomes([
        { rawOne: { count: "30" } }, // module views current
        { rawOne: { count: "24" } }, // cta clicks current
        { rawOne: { count: "18" } }, // artifact used current
        { rawOne: { count: "17" } }, // artifact refine current
        { rawOne: { count: "2" } }, // opportunity commit current
      ]),
    );

    const summary = await service.getSummary(30);

    expect(summary.weakestStep).toMatchObject({
      weakestStepKey: "artifactToCommitRate",
      weakestStepLabel: "Artifact intent to opportunity commit",
      weakestStepNumerator: 2,
      weakestStepDenominator: 18,
      weakestStepRate: 0.1111111111111111,
      severity: "High",
      confidence: "Low",
      confidenceReason: "Based on limited current-period volume",
      watchlistStatus: "monitor",
      watchlistPriority: "medium",
      watchlistReason: "This bottleneck shows enough risk to monitor closely.",
      recommendationTitle: "Improve opportunity capture",
    });
    expect(summary.recommendedNextAction).toMatchObject({
      actionTitle: "Improve opportunity capture visibility",
      actionFocus: "opportunity_capture",
      actionSource: "weakest_step",
    });
  });

  it("returns a neutral recommendation when the current funnel has no signal", async () => {
    const service = buildService([
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawMany: [] },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
    ]);

    const summary = await service.getSummary(30);

    expect(summary.weakestStep).toMatchObject({
      weakestStepKey: null,
      weakestStepLabel: null,
      weakestStepNumerator: 0,
      weakestStepDenominator: 0,
      weakestStepRate: 0,
      weakestStepPreviousRate: 0,
      weakestStepDelta: 0,
      weakestStepDirection: "none",
      weakestStepPreviousNumerator: 0,
      weakestStepPreviousDenominator: 0,
      weakestStepTrendReason: "No prior-period comparison is available for this weakest step.",
      benchmarkStepRate: 0,
      relativeDrop: 0,
      severity: "None",
      confidence: "None",
      confidenceReason: "Not enough current-period volume to trust this signal yet",
      watchlistStatus: "stable",
      watchlistPriority: "none",
      watchlistReason: "No active weakest-step signal is available yet.",
      recommendationTitle: "Not enough signal yet",
    });
    expect(summary.recommendedNextAction).toMatchObject({
      actionTitle: "No action recommended yet",
      actionBody: "There is not enough current-period signal to determine a meaningful next action.",
      actionFocus: "none",
      actionSource: "none",
    });
    expect(summary.exportMetadata.selectedWindowDays).toBe(30);
    expect(summary.exportMetadata.exportedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(summary.formattedExports.plainTextBrief).toContain("Weakest step: None");
    expect(summary.formattedExports.plainTextBrief).toContain(
      "Recommended action: No action recommended yet",
    );
    expect(JSON.parse(summary.formattedExports.jsonPayload)).toMatchObject({
      selectedWindowDays: 30,
      weakestStepLabel: null,
      recommendedActionTitle: null,
    });
    expect(summary.operatorSummary).toMatchObject({
      tone: "neutral",
      primaryFocus: "no_signal",
      headline: "Not enough signal yet to identify a funnel risk.",
      subheadline:
        "Product Signal does not yet have enough current-period activity to surface a trustworthy weakest step.",
      supportingReason: "No active weakest-step signal is available yet.",
      recommendedActionTitle: null,
    });
    expect(summary.weakestStep.recommendationBody).toBe(
      "There is not enough current period funnel activity to identify a weak point.",
    );
  });

  it("shows an improving trend when the weakest step beats the prior period", async () => {
    const service = buildService([
      { rawOne: { count: "10" } },
      { rawOne: { count: "8" } },
      { rawOne: { count: "6" } },
      { rawOne: { count: "3" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "10" } }, // module views current
      { rawOne: { count: "10" } }, // cta clicks current
      { rawOne: { count: "9" } }, // artifact used current
      { rawOne: { count: "9" } }, // artifact refine current
      { rawOne: { count: "8" } }, // opportunity commit current
      { rawMany: [] },
      { rawOne: { count: "10" } }, // previous module views
      { rawOne: { count: "7" } }, // previous cta clicks
      { rawOne: { count: "9" } }, // previous artifact used
      { rawOne: { count: "9" } }, // previous artifact refine
      { rawOne: { count: "7" } }, // previous opportunity commit
    ]);

    const summary = await service.getSummary(30);

    expect(summary.weakestStep.weakestStepKey).toBe("artifactToCommitRate");
    expect(summary.weakestStep.weakestStepPreviousNumerator).toBe(7);
    expect(summary.weakestStep.weakestStepPreviousDenominator).toBe(9);
    expect(summary.weakestStep.weakestStepPreviousRate).toBeCloseTo(0.7777777778, 5);
    expect(summary.weakestStep.weakestStepDelta).toBeCloseTo(0.1111111111, 5);
    expect(summary.weakestStep.weakestStepDirection).toBe("improving");
    expect(summary.weakestStep.weakestStepTrendReason).toBe(
      "This weakest step is performing better than in the prior period.",
    );
    expect(summary.weakestStep.watchlistStatus).toBe("monitor");
    expect(summary.weakestStep.watchlistPriority).toBe("low");
    expect(summary.recommendedNextAction).toMatchObject({
      actionTitle: "Improve opportunity capture visibility",
      actionFocus: "opportunity_capture",
      actionSource: "weakest_step",
    });
    expect(summary.operatorSummary).toMatchObject({
      tone: "informative",
      primaryFocus: "positive_recovery",
      headline: "The current weakest step is improving, but it remains the main funnel constraint.",
      subheadline:
        "The bottleneck is recovering relative to the prior period, which lowers urgency but does not remove the constraint.",
      supportingReason: "Keep monitoring the weakest step until the gap versus stronger steps narrows further.",
      recommendedActionTitle: "Improve opportunity capture visibility",
    });
  });

  it("shows a worsening trend when the weakest step declines versus prior period", async () => {
    const service = buildService([
      { rawOne: { count: "10" } },
      { rawOne: { count: "8" } },
      { rawOne: { count: "6" } },
      { rawOne: { count: "3" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "50" } },
      { rawOne: { count: "20" } },
      { rawOne: { count: "18" } },
      { rawOne: { count: "18" } },
      { rawOne: { count: "18" } },
      { rawMany: [] },
      { rawOne: { count: "50" } },
      { rawOne: { count: "40" } },
      { rawOne: { count: "18" } },
      { rawOne: { count: "18" } },
      { rawOne: { count: "18" } },
    ]);

    const summary = await service.getSummary(30);

    expect(summary.weakestStep.weakestStepKey).toBe("moduleViewToCtaRate");
    expect(summary.weakestStep.weakestStepPreviousNumerator).toBe(40);
    expect(summary.weakestStep.weakestStepPreviousDenominator).toBe(50);
    expect(summary.weakestStep.weakestStepPreviousRate).toBe(0.8);
    expect(summary.weakestStep.weakestStepDelta).toBeCloseTo(-0.4, 5);
    expect(summary.weakestStep.weakestStepDirection).toBe("worsening");
    expect(summary.weakestStep.weakestStepTrendReason).toBe(
      "This weakest step is performing worse than in the prior period.",
    );
    expect(summary.weakestStep.watchlistStatus).toBe("action_needed");
    expect(summary.weakestStep.watchlistPriority).toBe("high");
    expect(summary.recommendedNextAction).toMatchObject({
      actionTitle: "Improve Results CTA clarity",
      actionFocus: "results_cta",
      actionSource: "weakest_step_with_release_context",
    });
  });

  it("shows a flat trend when the weakest step is materially unchanged", async () => {
    const service = buildService([
      { rawOne: { count: "10" } },
      { rawOne: { count: "8" } },
      { rawOne: { count: "6" } },
      { rawOne: { count: "3" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "50" } },
      { rawOne: { count: "45" } },
      { rawOne: { count: "1" } },
      { rawOne: { count: "45" } },
      { rawOne: { count: "45" } },
      { rawMany: [] },
      { rawOne: { count: "50" } },
      { rawOne: { count: "45" } },
      { rawOne: { count: "1" } },
      { rawOne: { count: "45" } },
      { rawOne: { count: "45" } },
    ]);

    const summary = await service.getSummary(30);

    expect(summary.weakestStep.weakestStepKey).toBe("ctaToArtifactRate");
    expect(summary.weakestStep.weakestStepPreviousRate).toBeCloseTo(0.0222222222, 5);
    expect(summary.weakestStep.weakestStepDelta).toBeCloseTo(0, 5);
    expect(summary.weakestStep.weakestStepDirection).toBe("flat");
    expect(summary.weakestStep.weakestStepTrendReason).toBe(
      "This weakest step is materially unchanged versus the prior period.",
    );
    expect(summary.weakestStep.watchlistStatus).toBe("action_needed");
    expect(summary.weakestStep.watchlistPriority).toBe("high");
    expect(summary.recommendedNextAction).toMatchObject({
      actionTitle: "Reduce Studio entry friction",
      actionFocus: "studio_entry",
      actionSource: "weakest_step_with_release_context",
    });
    expect(summary.operatorSummary).toMatchObject({
      tone: "urgent",
      primaryFocus: "weak_step_action",
      headline: "Action needed: Results CTA to artifact intent is the main funnel bottleneck right now.",
      subheadline: "The current weakest step is severe, supported by meaningful volume, and is not improving.",
      supportingReason: "Combine the weakest-step recommendation with release context to investigate likely causes.",
      recommendedActionTitle: "Reduce Studio entry friction",
    });
  });

  it("shows an action-needed summary when the weakest step is flat but severe", async () => {
    const service = buildService([
      { rawOne: { count: "55" } },
      { rawOne: { count: "180" } },
      { rawOne: { count: "100" } },
      { rawOne: { count: "55" } },
      { rawOne: { count: "50" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "55" } },
      { rawOne: { count: "180" } },
      { rawOne: { count: "100" } },
      { rawOne: { count: "55" } },
      { rawOne: { count: "60" } },
      { rawMany: [] },
      { rawOne: { count: "55" } },
      { rawOne: { count: "180" } },
      { rawOne: { count: "100" } },
      { rawOne: { count: "55" } },
      { rawOne: { count: "60" } },
    ]);

    const summary = await service.getSummary(30);

    expect(summary.weakestStep.weakestStepKey).toBe("artifactToRefineRate");
    expect(summary.weakestStep.watchlistStatus).toBe("action_needed");
    expect(summary.weakestStep.weakestStepDirection).toBe("flat");
    expect(summary.recommendedNextAction).toMatchObject({
      actionTitle: "Strengthen refine flow value",
      actionFocus: "refine_flow",
      actionSource: "weakest_step",
    });
    expect(summary.operatorSummary).toMatchObject({
      tone: "urgent",
      primaryFocus: "weak_step_action",
      headline: "Action needed: Artifact intent to refine intent is the main funnel bottleneck right now.",
      subheadline:
        "The current weakest step is severe, supported by meaningful volume, and is not improving.",
      supportingReason: "Combine the weakest-step recommendation with release context to investigate likely causes.",
      recommendedActionTitle: "Strengthen refine flow value",
    });
  });

  it("returns none trend when prior comparison is unavailable", async () => {
    const service = buildService([
      { rawOne: { count: "10" } },
      { rawOne: { count: "8" } },
      { rawOne: { count: "6" } },
      { rawOne: { count: "3" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "50" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "15" } },
      { rawOne: { count: "12" } },
      { rawOne: { count: "10" } },
      { rawMany: [] },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "4" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "2" } },
    ]);

    const summary = await service.getSummary(30);

    expect(summary.weakestStep.weakestStepKey).toBe("moduleViewToCtaRate");
    expect(summary.weakestStep.weakestStepPreviousNumerator).toBe(0);
    expect(summary.weakestStep.weakestStepPreviousDenominator).toBe(0);
    expect(summary.weakestStep.weakestStepPreviousRate).toBe(0);
    expect(summary.weakestStep.weakestStepDelta).toBe(0);
    expect(summary.weakestStep.weakestStepDirection).toBe("none");
    expect(summary.weakestStep.weakestStepTrendReason).toBe(
      "No prior-period comparison is available for this weakest step.",
    );
    expect(summary.weakestStep.watchlistStatus).toBe("stable");
    expect(summary.weakestStep.watchlistPriority).toBe("none");
    expect(summary.recommendedNextAction).toMatchObject({
      actionTitle: "Improve Results CTA clarity",
      actionFocus: "results_cta",
      actionSource: "weakest_step",
    });
  });

  it("returns none trend when the weakest step is null", async () => {
    const service = buildService([
      { rawOne: { count: "10" } },
      { rawOne: { count: "8" } },
      { rawOne: { count: "6" } },
      { rawOne: { count: "3" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawMany: [] },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
    ]);

    const summary = await service.getSummary(30);

    expect(summary.weakestStep.weakestStepKey).toBeNull();
    expect(summary.weakestStep.weakestStepPreviousRate).toBe(0);
    expect(summary.weakestStep.weakestStepDelta).toBe(0);
    expect(summary.weakestStep.weakestStepDirection).toBe("none");
    expect(summary.weakestStep.weakestStepTrendReason).toBe(
      "No prior-period comparison is available for this weakest step.",
    );
    expect(summary.weakestStep.watchlistStatus).toBe("stable");
    expect(summary.weakestStep.watchlistPriority).toBe("none");
    expect(summary.weakestStep.watchlistReason).toBe(
      "No active weakest-step signal is available yet.",
    );
    expect(summary.operatorSummary.recommendedActionTitle).toBeNull();
  });

  it("keeps previous-period trend context intact for the existing rates", async () => {
    const service = buildService([
      { rawOne: { count: "10" } },
      { rawOne: { count: "8" } },
      { rawOne: { count: "6" } },
      { rawOne: { count: "3" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "10" } },
      { rawOne: { count: "5" } },
      { rawOne: { count: "5" } },
      { rawOne: { count: "5" } },
      { rawOne: { count: "5" } },
      { rawMany: [] },
      { rawOne: { count: "8" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "4" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "1" } },
    ]);

    const summary = await service.getSummary(30);

    expect(summary.trendContext.resultsImprovementCtaRate.current).toBeGreaterThanOrEqual(0);
    expect(summary.trendContext.resultsImprovementCtaRate.previous).toBeGreaterThanOrEqual(0);
    expect(["up", "down", "flat"]).toContain(summary.trendContext.resultsImprovementCtaRate.direction);
    expect(summary.trendContext.artifactToOpportunityCommitRate.previous).toBeGreaterThanOrEqual(0);
  });
});

describe("AnalyticsService release annotations", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-02T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("includes release annotations and marks current versus previous windows", async () => {
    const service = buildService([
      { rawOne: { count: "50" } },
      { rawOne: { count: "10" } },
      { rawOne: { count: "40" } },
      { rawOne: { count: "35" } },
      { rawOne: { count: "30" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "10" } },
      { rawOne: { count: "1" } },
      { rawOne: { count: "30" } },
      { rawOne: { count: "25" } },
      { rawOne: { count: "20" } },
      { rawMany: [] },
      { rawOne: { count: "10" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "20" } },
      { rawOne: { count: "15" } },
      { rawOne: { count: "10" } },
    ]);

    const summary = await service.getSummary(30);

    expect(summary.releaseAnnotations.length).toBeGreaterThanOrEqual(4);
    expect(summary.releaseAnnotations.some((release) => release.isInCurrentWindow)).toBe(true);
    expect(summary.releaseAnnotations.some((release) => release.isInPreviousWindow)).toBe(true);
    expect(summary.weakestStepReleaseContext.relevantCurrentWindowReleases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Results improvement module copy update",
          isInCurrentWindow: true,
          isInPreviousWindow: false,
        }),
      ]),
    );
    expect(summary.weakestStepReleaseContext.relevantPreviousWindowReleases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Opportunity save CTA placement change",
          isInCurrentWindow: false,
          isInPreviousWindow: true,
        }),
      ]),
    );
    expect(summary.weakestStepReleaseContext.releaseContextSummary).toBe(
      "Recent relevant product changes exist in the current comparison window.",
    );
    expect(summary.recommendedNextAction.actionSource).toBe("weakest_step");
    expect(summary.recommendedNextAction.actionBody).toBe(
      "Simplify CTA copy, reduce competing actions, and test a single clear next step from Results.",
    );
  });

  it("maps weakest step relevance for artifact commit and module CTA bottlenecks", async () => {
    const artifactCommitService = buildService([
      { rawOne: { count: "10" } },
      { rawOne: { count: "8" } },
      { rawOne: { count: "6" } },
      { rawOne: { count: "3" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "10" } },
      { rawOne: { count: "10" } },
      { rawOne: { count: "9" } },
      { rawOne: { count: "9" } },
      { rawOne: { count: "8" } },
      { rawMany: [] },
      { rawOne: { count: "10" } },
      { rawOne: { count: "7" } },
      { rawOne: { count: "9" } },
      { rawOne: { count: "9" } },
      { rawOne: { count: "7" } },
    ]);
    const artifactCommitSummary = await artifactCommitService.getSummary(30);
    expect(artifactCommitSummary.weakestStep.weakestStepKey).toBe("artifactToCommitRate");
    expect(artifactCommitSummary.weakestStepReleaseContext.relevantPreviousWindowReleases.length).toBeGreaterThan(0);
    expect(artifactCommitSummary.weakestStepReleaseContext.releaseContextSummary).toBe(
      "Relevant product changes were shipped in the prior comparison window.",
    );
    expect(artifactCommitSummary.recommendedNextAction.actionSource).toBe("weakest_step");

    const moduleCtaService = buildService([
      { rawOne: { count: "100" } },
      { rawOne: { count: "10" } },
      { rawOne: { count: "60" } },
      { rawOne: { count: "50" } },
      { rawOne: { count: "50" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "100" } },
      { rawOne: { count: "8" } },
      { rawOne: { count: "60" } },
      { rawOne: { count: "50" } },
      { rawOne: { count: "50" } },
      { rawMany: [] },
      { rawOne: { count: "100" } },
      { rawOne: { count: "8" } },
      { rawOne: { count: "60" } },
      { rawOne: { count: "50" } },
      { rawOne: { count: "50" } },
    ]);
    const moduleCtaSummary = await moduleCtaService.getSummary(30);
    expect(moduleCtaSummary.weakestStep.weakestStepKey).toBe("moduleViewToCtaRate");
    expect(moduleCtaSummary.weakestStepReleaseContext.relevantCurrentWindowReleases.length).toBeGreaterThan(0);
    expect(moduleCtaSummary.weakestStepReleaseContext.releaseContextSummary).toBe(
      "Recent relevant product changes exist in the current comparison window.",
    );
    expect(moduleCtaSummary.recommendedNextAction.actionSource).toBe("weakest_step_with_release_context");
  });

  it("returns the no matching releases fallback when no relevant release annotations are in window", async () => {
    jest.setSystemTime(new Date("2025-12-01T12:00:00.000Z"));
    const service = buildService([
      { rawOne: { count: "10" } },
      { rawOne: { count: "8" } },
      { rawOne: { count: "6" } },
      { rawOne: { count: "3" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "50" } },
      { rawOne: { count: "45" } },
      { rawOne: { count: "44" } },
      { rawOne: { count: "43" } },
      { rawOne: { count: "42" } },
      { rawMany: [] },
      { rawOne: { count: "50" } },
      { rawOne: { count: "45" } },
      { rawOne: { count: "44" } },
      { rawOne: { count: "43" } },
      { rawOne: { count: "42" } },
    ]);

    const summary = await service.getSummary(30);

    expect(summary.weakestStepReleaseContext.relevantCurrentWindowReleases).toHaveLength(0);
    expect(summary.weakestStepReleaseContext.relevantPreviousWindowReleases).toHaveLength(0);
    expect(summary.weakestStepReleaseContext.releaseContextSummary).toBe(
      "No directly relevant release annotations were found in the current or prior comparison windows.",
    );
  });

  it("falls back to no weakest-step release context when the weakest step is null", async () => {
    const service = buildService([
      { rawOne: { count: "10" } },
      { rawOne: { count: "8" } },
      { rawOne: { count: "6" } },
      { rawOne: { count: "3" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawMany: [] },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "0" } },
    ]);

    const summary = await service.getSummary(30);

    expect(summary.weakestStep.weakestStepKey).toBeNull();
    expect(summary.weakestStepReleaseContext.relevantCurrentWindowReleases).toHaveLength(0);
    expect(summary.weakestStepReleaseContext.relevantPreviousWindowReleases).toHaveLength(0);
    expect(summary.weakestStepReleaseContext.releaseContextSummary).toBe(
      "No weakest-step release context is available yet.",
    );
    expect(summary.recommendedNextAction).toMatchObject({
      actionTitle: "No action recommended yet",
      actionFocus: "none",
      actionSource: "none",
    });
  });
});

describe("ProductSignal snapshot persistence", () => {
  it("saves a flattened snapshot and export payload", async () => {
    const { service, snapshotRepo } = buildServiceWithSnapshots([
      { rawOne: { count: "100" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "60" } },
      { rawOne: { count: "50" } },
      { rawOne: { count: "50" } },
      { rawOne: { count: "0" } },
      { rawMany: [] },
      { rawOne: { count: "60" } },
      { rawOne: { count: "0" } },
      { rawOne: { count: "50" } },
      { rawOne: { count: "50" } },
      { rawOne: { count: "50" } },
    ]);

    const saved = await service.saveProductSignalSnapshot(30);
    const created = snapshotRepo.create.mock.calls[0][0];
    expect(created).toMatchObject({
      selectedWindowDays: 30,
      headline: saved.headline,
      tone: saved.tone,
      primaryFocus: saved.primaryFocus,
      weakestStepLabel: saved.weakestStepLabel,
      weakestStepRate: saved.weakestStepRate,
      watchlistStatus: saved.watchlistStatus,
      watchlistPriority: saved.watchlistPriority,
      severity: saved.severity,
      confidence: saved.confidence,
      recommendedActionTitle: saved.recommendedActionTitle,
      releaseContextSummary: saved.releaseContextSummary,
      reviewStatus: "open",
      reviewNote: "",
      reviewedAt: null,
    });
    const payload = JSON.parse(saved.exportPayloadJson);
    expect(payload).toMatchObject({
      exportedAt: expect.any(String),
      selectedWindowDays: 30,
      headline: saved.headline,
      weakestStepLabel: saved.weakestStepLabel,
      watchlistStatus: saved.watchlistStatus,
      recommendedActionTitle: saved.recommendedActionTitle,
    });
  });

  it("lists snapshots newest first", async () => {
    const { service, snapshotRepo } = buildServiceWithSnapshots([
      { rawOne: { count: "10" } },
      { rawOne: { count: "8" } },
      { rawOne: { count: "6" } },
      { rawOne: { count: "3" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "0" } },
      { rawMany: [] },
      { rawOne: { count: "8" } },
      { rawOne: { count: "4" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "1" } },
      { rawOne: { count: "1" } },
    ]);
    snapshotRepo.find.mockResolvedValueOnce([
      {
        id: "newer",
        createdAt: new Date("2026-04-02T12:00:00.000Z"),
        reviewStatus: "monitoring",
        reviewNote: "Watching after release",
        reviewedAt: new Date("2026-04-02T13:00:00.000Z"),
      },
      {
        id: "older",
        createdAt: new Date("2026-04-01T12:00:00.000Z"),
        reviewStatus: "open",
        reviewNote: "",
        reviewedAt: null,
      },
    ]);

    const rows = await service.listProductSignalSnapshots(10);
    expect(rows.map((row) => row.id)).toEqual(["newer", "older"]);
    expect(rows[0]).toMatchObject({
      reviewStatus: "monitoring",
      reviewNote: "Watching after release",
      reviewedAt: new Date("2026-04-02T13:00:00.000Z"),
    });
  });

  it("returns a clean no-snapshot compare response", async () => {
    const { service } = buildServiceWithSnapshots([
      { rawOne: { count: "10" } },
      { rawOne: { count: "8" } },
      { rawOne: { count: "6" } },
      { rawOne: { count: "3" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "0" } },
      { rawMany: [] },
      { rawOne: { count: "8" } },
      { rawOne: { count: "4" } },
      { rawOne: { count: "2" } },
      { rawOne: { count: "1" } },
      { rawOne: { count: "1" } },
    ]);

    const comparison = await service.compareProductSignalSnapshot(30);
    expect(comparison).toMatchObject({
      hasSnapshot: false,
      latestSnapshotCreatedAt: null,
      latestSnapshotReviewStatus: null,
      latestSnapshotReviewNote: null,
      latestSnapshotReviewedAt: null,
      comparisonSummary: "No saved Product Signal snapshot exists yet.",
      changedFields: [],
    });
  });

  it("reports unchanged when the latest snapshot matches and ignores tiny weakest-step noise", async () => {
    const { service, snapshotRepo } = buildServiceWithSnapshots([{ rawMany: [] }]);
    service.getSummary = jest.fn(async () => ({
      operatorSummary: {
        headline: "Action needed: Results improvement module to CTA is the main funnel bottleneck right now.",
        tone: "urgent",
        primaryFocus: "weak_step_action",
      },
      adminSummaryExport: {
        headline: "Action needed: Results improvement module to CTA is the main funnel bottleneck right now.",
        tone: "urgent",
        primaryFocus: "weak_step_action",
        weakestStepLabel: "Results improvement module to CTA",
        weakestStepRate: 0,
        weakestStepDirection: "worsening",
        watchlistStatus: "action_needed",
        watchlistPriority: "high",
        severity: "High",
        confidence: "High",
        recommendedActionTitle: "Improve Results CTA clarity",
        recommendedActionBody:
          "Simplify CTA copy, reduce competing actions, and test a single clear next step from Results. Recent product changes in this area may be contributing. Review recent releases before making additional changes.",
        releaseContextSummary: "Recent relevant product changes exist in the current comparison window.",
      },
    }) as any);
    snapshotRepo.findOne.mockResolvedValueOnce({
      id: "snapshot-1",
      createdAt: new Date("2026-04-01T12:00:00.000Z"),
      headline: "Action needed: Results improvement module to CTA is the main funnel bottleneck right now.",
      tone: "urgent",
      primaryFocus: "weak_step_action",
      weakestStepLabel: "Results improvement module to CTA",
      weakestStepRate: "0",
      weakestStepDirection: "worsening",
      watchlistStatus: "action_needed",
      watchlistPriority: "high",
      severity: "High",
      confidence: "High",
      recommendedActionTitle: "Improve Results CTA clarity",
      recommendedActionBody:
        "Simplify CTA copy, reduce competing actions, and test a single clear next step from Results. Recent product changes in this area may be contributing. Review recent releases before making additional changes.",
      releaseContextSummary: "Recent relevant product changes exist in the current comparison window.",
      exportPayloadJson: "{}",
      reviewStatus: "open",
      reviewNote: "",
      reviewedAt: null,
    });

    const comparison = await service.compareProductSignalSnapshot(30);
    expect(comparison).toMatchObject({
      hasSnapshot: true,
      latestSnapshotCreatedAt: "2026-04-01T12:00:00.000Z",
      latestSnapshotReviewStatus: "open",
      latestSnapshotReviewNote: "",
      latestSnapshotReviewedAt: null,
      comparisonSummary: "Current Product Signal summary is materially unchanged from the latest saved snapshot.",
      changedFields: [],
    });
  });

  it("reports changed fields when the latest snapshot differs", async () => {
    const { service, snapshotRepo } = buildServiceWithSnapshots([{ rawMany: [] }]);
    service.getSummary = jest.fn(async () => ({
      operatorSummary: {
        headline: "Action needed: Results improvement module to CTA is the main funnel bottleneck right now.",
        tone: "urgent",
        primaryFocus: "weak_step_action",
      },
      adminSummaryExport: {
        headline: "Action needed: Results improvement module to CTA is the main funnel bottleneck right now.",
        tone: "urgent",
        primaryFocus: "weak_step_action",
        weakestStepLabel: "Results improvement module to CTA",
        weakestStepRate: 0,
        weakestStepDirection: "worsening",
        watchlistStatus: "action_needed",
        watchlistPriority: "high",
        severity: "High",
        confidence: "High",
        recommendedActionTitle: "Improve Results CTA clarity",
        recommendedActionBody:
          "Simplify CTA copy, reduce competing actions, and test a single clear next step from Results. Recent product changes in this area may be contributing. Review recent releases before making additional changes.",
        releaseContextSummary: "Recent relevant product changes exist in the current comparison window.",
      },
    }) as any);
    snapshotRepo.findOne.mockResolvedValueOnce({
      id: "snapshot-1",
      createdAt: new Date("2026-04-01T12:00:00.000Z"),
      headline: "Old headline",
      tone: "urgent",
      primaryFocus: "weak_step_action",
      weakestStepLabel: "Results improvement module to CTA",
      weakestStepRate: "0.0004",
      weakestStepDirection: "worsening",
      watchlistStatus: "action_needed",
      watchlistPriority: "high",
      severity: "High",
      confidence: "High",
      recommendedActionTitle: "Improve Results CTA clarity",
      recommendedActionBody:
        "Simplify CTA copy, reduce competing actions, and test a single clear next step from Results. Recent product changes in this area may be contributing. Review recent releases before making additional changes.",
      releaseContextSummary: "Old release context",
      exportPayloadJson: "{}",
      reviewStatus: "open",
      reviewNote: "",
      reviewedAt: null,
    });

    const comparison = await service.compareProductSignalSnapshot(30);
    expect(comparison.hasSnapshot).toBe(true);
    expect(comparison.latestSnapshotReviewStatus).toBe("open");
    expect(comparison.latestSnapshotReviewNote).toBe("");
    expect(comparison.latestSnapshotReviewedAt).toBeNull();
    expect(comparison.changedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "headline" }),
        expect.objectContaining({ field: "releaseContextSummary" }),
      ]),
    );
    expect(comparison.comparisonSummary).toBe(
      "Current Product Signal summary differs from the latest saved snapshot in 2 key field(s).",
    );
  });

  it("updates snapshot review fields and sets reviewedAt", async () => {
    const { service, snapshotRepo } = buildServiceWithSnapshots([{ rawMany: [] }]);
    snapshotRepo.findOne.mockResolvedValueOnce({
      id: "snapshot-1",
      createdAt: new Date("2026-04-01T12:00:00.000Z"),
      headline: "Headline",
      tone: "urgent",
      primaryFocus: "weak_step_action",
      weakestStepLabel: "Results improvement module to CTA",
      weakestStepRate: "0.0000",
      weakestStepDirection: "worsening",
      watchlistStatus: "action_needed",
      watchlistPriority: "high",
      severity: "High",
      confidence: "High",
      recommendedActionTitle: "Improve Results CTA clarity",
      recommendedActionBody: "Body",
      releaseContextSummary: "Context",
      exportPayloadJson: "{}",
      reviewStatus: "open",
      reviewNote: "",
      reviewedAt: null,
    });

    const updated = await service.updateProductSignalSnapshot("snapshot-1", {
      reviewStatus: "monitoring",
      reviewNote: "Watching after release",
    });

    expect(snapshotRepo.save).toHaveBeenCalled();
    expect(updated).toMatchObject({
      reviewStatus: "monitoring",
      reviewNote: "Watching after release",
      reviewedAt: expect.any(Date),
    });
  });

  it("rejects an invalid review status", async () => {
    const { service } = buildServiceWithSnapshots([{ rawMany: [] }]);
    await expect(
      service.updateProductSignalSnapshot("snapshot-1", {
        reviewStatus: "invalid" as any,
      }),
    ).rejects.toThrow("reviewStatus must be open, monitoring, or resolved");
  });
});
