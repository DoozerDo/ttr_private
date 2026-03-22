import { render, screen } from "@testing-library/react";

import { OpportunityMapSection, getOpportunityVerdict, getPrimaryResultsCta } from "@/app/(app)/results/page";
import type { GenerationReadiness, VerificationCoverage } from "@/lib/generationReadiness";
import { ScoreBand } from "@/src/lib/score-band";

const readyReadiness: GenerationReadiness = {
  status: "ready",
  blocked: false,
  reasonCodes: [],
  reasons: [],
  badgeLabel: "READY",
  summary: "Generation is ready for this scored analysis context.",
  verificationIssues: [],
};

const strongCoverage: VerificationCoverage = {
  status: "strong",
  supportedClaims: 3,
  unsupportedClaims: 0,
  totalClaims: 3,
  summary: "Your baseline can fully support the claims required for this role.",
};

describe("Results opportunity map", () => {
  it("maps high score + ready readiness to Studio CTA", () => {
    const cta = getPrimaryResultsCta({
      scoreBand: ScoreBand.TOP,
      verificationCoverage: strongCoverage,
      studioHref: "/studio",
      canOpenStudio: true,
      fitReviewPath: "/fit-review?jobId=job-1",
    });

    expect(cta).toMatchObject({
      label: "Generate My Application",
      href: "/studio",
      disabled: false,
    });
  });

  it("maps high score + limited readiness to Studio CTA with limitation label", () => {
    const cta = getPrimaryResultsCta({
      scoreBand: ScoreBand.TOP,
      verificationCoverage: {
        ...strongCoverage,
        status: "partial",
        summary: "Some claims required for this role have limited verification support.",
      },
      studioHref: "/studio",
      canOpenStudio: true,
      fitReviewPath: "/fit-review?jobId=job-1",
    });

    expect(cta).toMatchObject({
      label: "Open Studio (limited generation)",
      href: "/studio",
      disabled: false,
    });
  });

  it("maps high score + blocked readiness away from Studio to blocker anchor", () => {
    const cta = getPrimaryResultsCta({
      scoreBand: ScoreBand.TOP,
      verificationCoverage: {
        ...strongCoverage,
        status: "weak",
      },
      studioHref: "/studio",
      canOpenStudio: true,
      fitReviewPath: "/fit-review?jobId=job-1",
    });

    expect(cta.label).toBe("Review Verification Gaps");
    expect(cta.href).toBe("#generation-readiness-details");
    expect(cta.href).not.toBe("/studio");
  });

  it("maps null scoreBand to safe non-Studio fallback, and still honors blocked routing", () => {
    const nullBandCta = getPrimaryResultsCta({
      scoreBand: null,
      verificationCoverage: strongCoverage,
      studioHref: "/studio",
      canOpenStudio: true,
      fitReviewPath: "/fit-review?jobId=job-1",
    });
    expect(nullBandCta).toMatchObject({
      label: "Strengthen this match in Fit Review",
      href: "/fit-review?jobId=job-1",
      disabled: false,
    });

    const nullBandBlockedCta = getPrimaryResultsCta({
      scoreBand: null,
      verificationCoverage: {
        ...strongCoverage,
        status: "weak",
      },
      studioHref: "/studio",
      canOpenStudio: true,
      fitReviewPath: "/fit-review?jobId=job-1",
    });
    expect(nullBandBlockedCta.label).toBe("Review Verification Gaps");
    expect(nullBandBlockedCta.href).toBe("#generation-readiness-details");
    expect(nullBandBlockedCta.href).not.toBe("/studio");
  });

  it("renders the opportunity map as a concise executive summary", () => {
    render(
      <OpportunityMapSection
        score={87}
        verdict={getOpportunityVerdict(87)}
        advantageSignals={[
          "Led global support operations",
          "Built escalation and incident workflows",
          "Drove cross-functional CX systems",
        ]}
        primaryCta={{ label: "Open Resume and Cover Letter Studio", href: "/studio" }}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
      />,
    );

    expect(screen.queryByText("Opportunity Map")).toBeNull();
    expect(
      screen.queryByText(
        "A focused read on how strong this match is, why it holds up, and what you should do next.",
      ),
    ).toBeNull();
    expect(screen.getByText("Competitive Match")).toBeInTheDocument();
    expect(screen.getByText("YOUR ADVANTAGE")).toBeInTheDocument();
    expect(screen.getByText("View score analysis")).toBeInTheDocument();
    expect(screen.getByText("Open Resume and Cover Letter Studio")).toBeInTheDocument();
    expect(screen.queryByText("Watchouts")).toBeNull();
    expect(screen.queryByText("Best next move")).toBeNull();
    expect(screen.queryByText("Fit")).toBeNull();
    expect(screen.queryByText("Risk")).toBeNull();
    expect(screen.getByText("Generation Readiness: READY")).toBeInTheDocument();
    expect(screen.getByText("Verification Coverage: STRONG")).toBeInTheDocument();
  });

  it("suppresses the advantage section when no verified advantages exist", () => {
    render(
      <OpportunityMapSection
        score={74}
        verdict={getOpportunityVerdict(74)}
        advantageSignals={[]}
        primaryCta={{ label: "Open Resume and Cover Letter Studio", href: "/studio" }}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
      />,
    );

    expect(screen.queryByText("YOUR ADVANTAGE")).toBeNull();
    expect(screen.queryByText("Verified baseline advantages are not available for this run yet.")).toBeNull();
  });

  it("maps score bands to the expected verdict", () => {
    expect(getOpportunityVerdict(92)).toMatchObject({ label: "Prime Opportunity" });
    expect(getOpportunityVerdict(75)).toMatchObject({ label: "Competitive Match" });
    expect(getOpportunityVerdict(84)).toMatchObject({ label: "Competitive Match" });
    expect(getOpportunityVerdict(64)).toMatchObject({ label: "Low Match" });
    expect(getOpportunityVerdict(52)).toMatchObject({ label: "Low Match" });
  });

  it("shows normal generate CTA for high score + ready readiness", () => {
    render(
      <OpportunityMapSection
        score={94}
        verdict={getOpportunityVerdict(94)}
        advantageSignals={["Led global support operations"]}
        primaryCta={{ label: "Generate My Application", href: "/studio" }}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
      />,
    );

    expect(screen.getByText("Generation Readiness: READY")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Generate My Application" });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/studio");
  });

  it("shows limitation state before click for high score + limited readiness", () => {
    render(
      <OpportunityMapSection
        score={92}
        verdict={getOpportunityVerdict(92)}
        advantageSignals={["Led global support operations"]}
        primaryCta={{ label: "Open Studio (limited generation)", href: "/studio" }}
        scoreAnalysisHref="#advanced-insights"
        readiness={{
          status: "limited",
          blocked: false,
          reasonCodes: ["personalization_limited"],
          reasons: [
            {
              code: "personalization_limitation",
              message:
                "This role scored highly, but document generation is currently limited by verification constraints.",
            },
          ],
          badgeLabel: "LIMITED",
          summary: "Fit score and generation readiness are separate. Tailored generation is currently limited.",
          verificationIssues: [],
        }}
        verificationCoverage={{
          status: "partial",
          supportedClaims: 1,
          unsupportedClaims: 0,
          totalClaims: 2,
          summary: "Some claims required for this role have limited verification support.",
        }}
      />,
    );

    expect(screen.getByText("Generation Readiness: LIMITED")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This role scored highly, but document generation is currently limited by verification constraints.",
      ),
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Open Studio (limited generation)" });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/studio");
  });

  it("shows blocked state before click for high score + blocked readiness", () => {
    render(
      <OpportunityMapSection
        score={95}
        verdict={getOpportunityVerdict(95)}
        advantageSignals={["Led global support operations"]}
        primaryCta={{ label: "Review Verification Gaps", href: "#generation-readiness-details" }}
        scoreAnalysisHref="#advanced-insights"
        readiness={{
          status: "blocked",
          blocked: true,
          reasonCodes: ["severity_blocker"],
          reasons: [
            {
              code: "full_block",
              message:
                "Some claims required for tailored generation could not be verified against your baseline.",
            },
          ],
          badgeLabel: "BLOCKED",
          summary:
            "Strong fit can still be blocked for generation when verification requirements are not met.",
          verificationIssues: [],
        }}
        verificationCoverage={{
          status: "weak",
          supportedClaims: 0,
          unsupportedClaims: 2,
          totalClaims: 2,
          summary: "Several claims required for this role cannot be verified from your baseline.",
        }}
      />,
    );

    expect(screen.getByText("Generation Readiness: BLOCKED")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Some claims required for tailored generation could not be verified against your baseline.",
      ),
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Review Verification Gaps" });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "#generation-readiness-details");
    expect(cta).not.toHaveAttribute("href", "/studio");
  });
});
