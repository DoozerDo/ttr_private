import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioRoleMatchPanel } from "@/app/(app)/studio/StudioRoleMatchPanel";
import type { RoleMatchFinalPass } from "@/lib/roleMatchFinalPass";

const strongFinalPass: RoleMatchFinalPass = {
  overallMatchReadiness: "needs_tightening",
  priorityCoverage: [
    {
      priority: "support operations rigor",
      covered: true,
      strength: "strong",
      evidenceSource: "resume summary",
    },
    {
      priority: "incident management leadership",
      covered: true,
      strength: "partial",
      evidenceSource: "resume experience",
    },
    {
      priority: "process architecture",
      covered: true,
      strength: "strong",
      evidenceSource: "cover letter opening",
    },
  ],
  keywordAlignment: {
    strongMatches: ["support operations"],
    partialMatches: ["incident management"],
    missingButImportant: ["cross-functional execution"],
    stuffedOrExcessive: [],
  },
  recruiterScanRisks: [
    {
      type: "top_third_too_generic",
      severity: "high",
      explanation: "The top of the resume still reads too broadly.",
    },
  ],
  recommendedFinalAdjustments: [
    {
      label: "Tighten the summary",
      type: "summary_tighten",
      target: "resume",
    },
  ],
};

describe("final role check panel", () => {
  it("displays the readiness state and recommended adjustment", () => {
    const onApplyAdjustment = vi.fn();

    render(
      <StudioRoleMatchPanel
        finalPass={strongFinalPass}
        onApplyAdjustment={onApplyAdjustment}
        isApplying={false}
      />,
    );

    expect(screen.getByTestId("studio-role-match-panel")).toHaveTextContent("Final role check");
    expect(screen.getByTestId("studio-role-match-panel")).toHaveTextContent("Good, but one final tightening is recommended");
    expect(screen.getByTestId("studio-role-match-panel")).toHaveTextContent("support operations rigor");
    expect(screen.getByTestId("final-role-adjustment-button")).toHaveTextContent("Apply final adjustment");

    fireEvent.click(screen.getByTestId("final-role-adjustment-button"));

    expect(onApplyAdjustment).toHaveBeenCalledTimes(1);
    expect(onApplyAdjustment.mock.calls[0][0]).toMatchObject({
      type: "summary_tighten",
      target: "resume",
    });
  });

  it("shows a ready state when no further tightening is needed", () => {
    render(
      <StudioRoleMatchPanel
        finalPass={{
          ...strongFinalPass,
          overallMatchReadiness: "ready",
          recruiterScanRisks: [],
          recommendedFinalAdjustments: [],
        }}
        onApplyAdjustment={vi.fn()}
      />,
    );

    expect(screen.getByTestId("studio-role-match-panel")).toHaveTextContent("Ready to export");
  });
});
