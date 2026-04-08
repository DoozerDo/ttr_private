import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioCritiquePanel } from "@/app/(app)/studio/StudioCritiquePanel";
import type { DocumentCritique } from "@/lib/documentCritique";
import type { RefinementPreset } from "@/lib/documentStrategyPlan";

const critique: DocumentCritique = {
  overallAssessment: "mixed",
  topIssues: [
    {
      type: "summary_generic",
      severity: "high",
      explanation: "The summary still reads broad and generic instead of leading with the chosen positioning frame.",
      recommendedRefinementTypes: ["tighten-summary"],
    },
    {
      type: "cover_letter_redundant",
      severity: "medium",
      explanation: "The cover letter is echoing the resume too closely instead of extending the story.",
      recommendedRefinementTypes: ["cover-business-impact"],
    },
  ],
  recommendedNextAction: {
    label: "Tighten the summary",
    refinementType: "summary_rewrite",
    target: "resume",
  },
};

describe("StudioCritiquePanel", () => {
  it("renders the critique and applies the best next recommendation", () => {
    const onApplyRecommendation = vi.fn();

    render(
      <StudioCritiquePanel
        critique={critique}
        onApplyRecommendation={onApplyRecommendation}
        isApplying={false}
      />,
    );

    expect(screen.getByTestId("studio-critique-panel")).toHaveTextContent("What to improve next");
    expect(screen.getByTestId("studio-critique-panel")).toHaveTextContent("Best next move");
    expect(screen.getByTestId("critique-issue-summary_generic")).toHaveTextContent("Tighten the summary");
    expect(screen.getByTestId("critique-issue-cover_letter_redundant")).toHaveTextContent(
      "Reduce cover letter repetition",
    );

    fireEvent.click(screen.getByTestId("critique-best-next-action"));

    expect(onApplyRecommendation).toHaveBeenCalledTimes(1);
    const [preset, issueType, placement] = onApplyRecommendation.mock.calls[0] as [
      RefinementPreset,
      string,
      string,
    ];
    expect(preset.key).toBe("tighten-summary");
    expect(issueType).toBe("summary_generic");
    expect(placement).toBe("best_next");
  });
});

