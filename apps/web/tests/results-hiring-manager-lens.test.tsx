import { render, screen } from "@testing-library/react";

import {
  getHiringManagerCaseRecommendations,
  HiringManagerLensSection,
} from "@/app/(app)/results/page";

describe("Hiring manager lens", () => {
  it("renders the hiring manager lens sections with concise signals", () => {
    render(
      <HiringManagerLensSection
        strengths={[
          "Led customer operations at scale",
          "Built escalation and incident workflows",
          "Experience partnering with engineering teams",
        ]}
        questions={[
          "No direct firmware engineering experience",
          "Limited embedded systems exposure",
        ]}
        recommendations={[
          "Highlight collaboration with infrastructure or platform engineering",
          "Emphasize operational ownership of complex technical systems",
        ]}
      />,
    );

    expect(screen.getByText("Hiring Manager Lens")).toBeInTheDocument();
    expect(
      screen.getByText("Strengths a hiring manager will notice"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Questions a hiring manager may have"),
    ).toBeInTheDocument();
    expect(screen.getByText("How to strengthen your case")).toBeInTheDocument();
    expect(screen.getByText(/Led customer operations at scale/i)).toBeInTheDocument();
    expect(screen.getByText(/No direct firmware engineering experience/i)).toBeInTheDocument();
  });

  it("prefers explicit recommendations and falls back to positioning guidance", () => {
    expect(
      getHiringManagerCaseRecommendations({
        score: 84,
        recommendedActions: [
          "Highlight collaboration with infrastructure or platform engineering",
          "Emphasize operational ownership of complex technical systems",
        ],
        strengths: ["Built escalation and incident workflows"],
        watchouts: ["No direct firmware engineering experience"],
      }),
    ).toEqual([
      "Highlight collaboration with infrastructure or platform engineering",
      "Emphasize operational ownership of complex technical systems",
    ]);

    expect(
      getHiringManagerCaseRecommendations({
        score: 72,
        recommendedActions: [],
        strengths: ["Built escalation and incident workflows"],
        watchouts: ["Limited embedded systems exposure"],
      }),
    ).toEqual([
      "Highlight collaboration with infrastructure or platform engineering",
      "Emphasize operational ownership of complex technical systems",
    ]);
  });
});
