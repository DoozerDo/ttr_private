import { expect, describe, it } from "vitest";

import { CAREER_ADJACENCY_RADAR_AXIS_DEFINITIONS } from "@/lib/careerAdjacencyRadar";

describe("career adjacency radar labels", () => {
  it("keeps the canonical Results labels and landing teaser labels aligned", () => {
    expect(CAREER_ADJACENCY_RADAR_AXIS_DEFINITIONS).toHaveLength(6);

    expect(CAREER_ADJACENCY_RADAR_AXIS_DEFINITIONS.map((axis) => axis.label)).toEqual([
      "Support Operations Leadership",
      "Incident / Reliability / NOC",
      "Customer Experience Strategy",
      "Technical Program / Change Management",
      "Tooling / Platform Depth",
      "Industry Context",
    ]);

    expect(CAREER_ADJACENCY_RADAR_AXIS_DEFINITIONS.map((axis) => axis.teaserLabel)).toEqual([
      "Support Ops Leadership",
      "Incident / Reliability",
      "CX Strategy",
      "Technical Program / Change",
      "Tooling / Platform Depth",
      "Industry Context",
    ]);
  });
});
