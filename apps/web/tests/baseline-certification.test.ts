import { describe, expect, it } from "vitest";

import { buildBaselineCertification } from "@/lib/baselineCertification";
import type { SignalGraphViewModel } from "@/lib/professionalSignals";
import type { BaselineDto } from "@/lib/baselines";

function createBaseline(sections: BaselineDto["sections"]): BaselineDto {
  return {
    id: "base-1",
    userId: "user-1",
    version: 1,
    originalFilename: "resume.pdf",
    mimeType: "application/pdf",
    storagePath: "/tmp/base-1",
    hash: null,
    status: "ACTIVE",
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    sections,
  };
}

describe("buildBaselineCertification", () => {
  const strongGraph: SignalGraphViewModel = {
    strongSignals: [],
    developingSignals: [],
    identifiedSignalCount: 8,
    strongSignalCount: 5,
    developingSignalCount: 2,
    hasQuantifiedImpactSignal: true,
    effectLines: [],
    fallbackUsed: false,
  };

  it("returns certified when analysis is strong and structured", () => {
    const baseline = createBaseline([
      {
        id: "s1",
        baselineId: "base-1",
        sectionType: "SUMMARY",
        title: "Director, Customer Operations",
        content:
          "2020-2024 Led customer operations leadership across support systems, incident management, process design, tooling, and quantified impact.",
        includePolicy: "always",
        order: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "s2",
        baselineId: "base-1",
        sectionType: "EXPERIENCE",
        title: "Operations Director",
        content:
          "Led customer operations leadership, support process design, tooling and workflow operations, incident management, and quantified business impact across enterprise support.",
        includePolicy: "always",
        order: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "s3",
        baselineId: "base-1",
        sectionType: "SKILLS",
        title: "Systems",
        content: "Zendesk, Jira, tooling, workflow operations, platform ownership, process architecture.",
        includePolicy: "always",
        order: 2,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const result = buildBaselineCertification({
      baseline,
      signalGraph: strongGraph,
      baselineStrengthPercent: 78,
      analysisStatus: "ready",
      analysesCompleted: 2,
    });

    expect(result.status).toBe("certified");
    expect(result.isCertified).toBe(true);
  });

  it("returns pending when analysis is not ready", () => {
    const result = buildBaselineCertification({
      baseline: null,
      signalGraph: {
        ...strongGraph,
        identifiedSignalCount: 0,
        strongSignalCount: 0,
        developingSignalCount: 0,
        hasQuantifiedImpactSignal: false,
        fallbackUsed: true,
      },
      baselineStrengthPercent: 24,
      analysisStatus: "not_analyzed",
      analysesCompleted: 0,
    });

    expect(result.status).toBe("not_ready");
    expect(result.isCertified).toBe(false);
  });

  it("returns not certified when gate conditions are not fully met", () => {
    const baseline = createBaseline([
      {
        id: "s1",
        baselineId: "base-1",
        sectionType: "EXPERIENCE",
        title: "Support Lead",
        content: "Worked support operations.",
        includePolicy: "always",
        order: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const result = buildBaselineCertification({
      baseline,
      signalGraph: {
        ...strongGraph,
        strongSignalCount: 3,
        identifiedSignalCount: 6,
        developingSignalCount: 4,
        hasQuantifiedImpactSignal: false,
      },
      baselineStrengthPercent: 62,
      analysisStatus: "ready",
      analysesCompleted: 1,
    });

    expect(result.status).toBe("not_certified");
    expect(result.title).toBe("CERTIFICATION IN PROGRESS");
    expect(result.isCertified).toBe(false);
    expect(result.checklist.find((item) => item.label === "Analyses completed")?.complete).toBe(false);
  });
});
