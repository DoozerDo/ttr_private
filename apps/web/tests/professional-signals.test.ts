import {
  buildBaselineSignalGraph,
  buildResultsSignalAlignment,
} from "@/lib/professionalSignals";

describe("professional signals", () => {
  it("derives strong and developing professional signals from baseline content", () => {
    const graph = buildBaselineSignalGraph({
      baseline: {
        id: "baseline-1",
        userId: "user-1",
        version: 1,
        originalFilename: "resume.pdf",
        mimeType: "application/pdf",
        storagePath: "/tmp/resume.pdf",
        hash: null,
        status: "ACTIVE",
        archivedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        sections: [
          {
            id: "section-1",
            baselineId: "baseline-1",
            sectionType: "EXPERIENCE",
            title: "Operations leadership",
            content:
              "Led customer support operations, built incident workflows, partnered cross-functional with product and engineering, and managed Zendesk administration.",
            includePolicy: "always",
            order: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });

    expect(graph.strongSignals.map((signal) => signal.label)).toContain(
      "Customer Operations Leadership",
    );
    expect(graph.identifiedSignalCount).toBeGreaterThanOrEqual(7);
    expect(graph.strongSignalCount).toBeGreaterThan(0);
    expect(graph.developingSignalCount).toBeGreaterThan(0);
    expect(graph.strongSignalCount + graph.developingSignalCount).toBe(graph.identifiedSignalCount);
    expect(graph.strongSignals.length).toBeLessThanOrEqual(graph.strongSignalCount);
    expect(graph.developingSignals.length).toBeLessThanOrEqual(graph.developingSignalCount);
    expect(graph.effectLines.length).toBeGreaterThan(0);
  });

  it("builds concise role signal alignment from strengths, gaps, and score dimensions", () => {
    const alignment = buildResultsSignalAlignment({
      strengths: [
        "Led support operations across customer escalations",
        "Built workflow design and incident response processes",
      ],
      criticalGapTitles: ["Platform ownership scope is unclear"],
      recommendedActions: ["Clarify the business impact and platform governance"],
      scoreBreakdownDimensions: [
        {
          key: "support_operations_and_process_rigor",
          label: "Support Operations",
          score: 18,
          weight: 20,
        },
        {
          key: "tooling_and_platform_experience",
          label: "Tools and Systems",
          score: 9,
          weight: 20,
        },
      ],
      verdictLabel: "Strong Match",
    });

    expect(alignment.renderable).toBe(true);
    expect(alignment.strongForRole.length).toBeGreaterThan(0);
    expect(alignment.weakerForRole.length).toBeGreaterThan(0);
    const overlap = alignment.strongForRole.filter((signal) =>
      alignment.weakerForRole.includes(signal),
    );
    expect(overlap).toHaveLength(0);
    expect(alignment.summary).toMatch(/role aligns strongly/i);
  });

  it("suppresses alignment when distinct strong and weak buckets cannot be formed", () => {
    const alignment = buildResultsSignalAlignment({
      strengths: ["operations", "incident", "tooling"],
      criticalGapTitles: [],
      recommendedActions: [],
      scoreBreakdownDimensions: [],
      verdictLabel: "Competitive Match",
    });

    expect(alignment.renderable).toBe(false);
  });
});
