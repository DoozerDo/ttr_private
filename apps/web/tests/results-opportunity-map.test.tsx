import { render, screen } from "@testing-library/react";

import {
  discoverCompetitiveRoles,
  buildStudioHrefWithExcludedRequirements,
  OpportunityMapSection,
  getOpportunityVerdict,
  getPrimaryResultsCta,
} from "@/app/(app)/results/page";
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
  verifiedClaims: 3,
  inferredClaims: 0,
  unverifiedClaims: 0,
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
      label: "Resolve verification gaps in Studio",
      href: "/studio#studio-auto-adjust-panel",
      disabled: false,
    });
  });

  it("preserves studio query params when linking to verification gap resolution", () => {
    const cta = getPrimaryResultsCta({
      scoreBand: ScoreBand.TOP,
      verificationCoverage: {
        ...strongCoverage,
        status: "partial",
        summary: "Some claims required for this role have limited verification support.",
      },
      studioHref: "/studio?analysisId=analysis-1&baselineId=base-1",
      canOpenStudio: true,
      fitReviewPath: "/fit-review?jobId=job-1",
    });

    expect(cta).toMatchObject({
      label: "Resolve verification gaps in Studio",
      href: "/studio?analysisId=analysis-1&baselineId=base-1#studio-auto-adjust-panel",
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
        canonicalCoverage={null}
        baselineEvidenceHref="/baseline"
        predictiveUnlock={null}
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
    expect(screen.getByText(/Verified claims:\s*3 \/ 3/i)).toBeInTheDocument();
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
        canonicalCoverage={null}
        baselineEvidenceHref="/baseline"
        predictiveUnlock={null}
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
        canonicalCoverage={null}
        baselineEvidenceHref="/baseline"
        predictiveUnlock={null}
      />,
    );

    expect(screen.getByText("Generation Readiness: READY")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Generate My Application" });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/studio");
  });

  it("renders strong fit limitation decision panel from canonical verification_coverage", () => {
    render(
      <OpportunityMapSection
        score={92}
        verdict={getOpportunityVerdict(92)}
        advantageSignals={["Led global support operations"]}
        primaryCta={{ label: "Resolve verification gaps in Studio", href: "/studio" }}
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
          verifiedClaims: 1,
          inferredClaims: 1,
          unverifiedClaims: 0,
          supportedClaims: 1,
          unsupportedClaims: 0,
          totalClaims: 2,
          summary: "Some claims required for this role have limited verification support.",
        }}
        canonicalCoverage={{
          totalClaims: 4,
          verifiedClaims: 2,
          inferredClaims: 1,
          unverifiedClaims: 1,
          supportedRequirements: ["Salesforce", "Service Cloud", "Omnichannel routing"],
          unverifiedRequirements: ["Zendesk", "Five9"],
        }}
        baselineEvidenceHref="/baseline?analysisId=analysis-1"
        predictiveUnlock={null}
      />,
    );

    expect(screen.getByText("Strong fit. Limited generation.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "You are highly aligned for this role. Document generation is limited because some requirements are not yet verified from your baseline.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("What's holding this back", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("- Zendesk")).toBeInTheDocument();
    expect(screen.getByText("- Five9")).toBeInTheDocument();
    expect(screen.getByText("Supported signals: Salesforce, Service Cloud, Omnichannel routing")).toBeInTheDocument();
    expect(screen.getByText(/Remove unsupported tools from targeting/i)).toBeInTheDocument();
    expect(screen.getByText(/Add verified evidence/i)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Resolve verification gaps in Studio" });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/studio");
    const baselineCta = screen.getByRole("link", { name: "Review baseline evidence" });
    expect(baselineCta).toHaveAttribute("href", "/baseline?analysisId=analysis-1");
    expect(screen.queryByText("Open Studio (limited generation)")).toBeNull();
    expect(screen.queryByText("No canonical labels provided")).toBeNull();
    expect(screen.queryByText("None listed")).toBeNull();
    expect(screen.queryByText(/Generation Readiness:/i)).toBeNull();
  });

  it("shows evidence-depth guidance when canonical unverified requirements are empty", () => {
    render(
      <OpportunityMapSection
        score={92}
        verdict={getOpportunityVerdict(92)}
        advantageSignals={["Led global support operations"]}
        primaryCta={{ label: "Resolve verification gaps in Studio", href: "/studio?analysisId=analysis-1#studio-auto-adjust-panel" }}
        scoreAnalysisHref="#advanced-insights"
        readiness={{
          status: "limited",
          blocked: false,
          reasonCodes: ["personalization_limited"],
          reasons: [{ code: "personalization_limitation", message: "limited" }],
          badgeLabel: "LIMITED",
          summary: "limited",
          verificationIssues: [],
        }}
        verificationCoverage={{
          status: "partial",
          verifiedClaims: 2,
          inferredClaims: 0,
          unverifiedClaims: 0,
          supportedClaims: 2,
          unsupportedClaims: 0,
          totalClaims: 2,
          summary: "partial",
        }}
        canonicalCoverage={{
          totalClaims: 2,
          verifiedClaims: 2,
          inferredClaims: 0,
          unverifiedClaims: 0,
          supportedRequirements: ["Salesforce", "Service Cloud"],
          unverifiedRequirements: [],
        }}
        baselineEvidenceHref="/baseline?analysisId=analysis-1"
        predictiveUnlock={null}
      />,
    );

    expect(
      screen.getByText("All required tools are supported. Generation limits may be due to evidence depth."),
    ).toBeInTheDocument();
    expect(screen.queryByText("None listed")).toBeNull();
  });

  it("shows canonical coverage missing guidance instead of fallback guesses", () => {
    render(
      <OpportunityMapSection
        score={92}
        verdict={getOpportunityVerdict(92)}
        advantageSignals={["Led global support operations"]}
        primaryCta={{ label: "Resolve verification gaps in Studio", href: "/studio?analysisId=analysis-1#studio-auto-adjust-panel" }}
        scoreAnalysisHref="#advanced-insights"
        readiness={{
          status: "limited",
          blocked: false,
          reasonCodes: ["personalization_limited"],
          reasons: [{ code: "personalization_limitation", message: "limited" }],
          badgeLabel: "LIMITED",
          summary: "limited",
          verificationIssues: [],
        }}
        verificationCoverage={{
          status: "partial",
          verifiedClaims: 0,
          inferredClaims: 0,
          unverifiedClaims: 1,
          supportedClaims: 0,
          unsupportedClaims: 1,
          totalClaims: 1,
          summary: "partial",
        }}
        canonicalCoverage={null}
        baselineEvidenceHref="/baseline?analysisId=analysis-1"
        predictiveUnlock={null}
      />,
    );

    expect(screen.getByText("Verification data unavailable. Re-run analysis.")).toBeInTheDocument();
    expect(screen.queryByText("No canonical labels provided")).toBeNull();
    expect(screen.queryByText("None listed")).toBeNull();
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
          verifiedClaims: 0,
          inferredClaims: 0,
          unverifiedClaims: 2,
          supportedClaims: 0,
          unsupportedClaims: 2,
          totalClaims: 2,
          summary: "Several claims required for this role cannot be verified from your baseline.",
        }}
        canonicalCoverage={null}
        baselineEvidenceHref="/baseline"
        predictiveUnlock={null}
      />,
    );

    expect(screen.getByText("Generation Readiness: BLOCKED")).toBeInTheDocument();
    expect(screen.getByText(/Verified claims:\s*0 \/ 2/i)).toBeInTheDocument();
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

  it("builds studio href with preemptive excluded requirements", () => {
    expect(
      buildStudioHrefWithExcludedRequirements("/studio?analysisId=analysis-1", ["Zendesk", "Five9"]),
    ).toBe("/studio?analysisId=analysis-1&excludedRequirements=Zendesk&excludedRequirements=Five9");
  });

  it("renders unlock full generation predictive section with remove-and-continue CTA", () => {
    render(
      <OpportunityMapSection
        score={94}
        verdict={getOpportunityVerdict(94)}
        advantageSignals={["Led global support operations"]}
        primaryCta={{
          label: "Remove unsupported requirements and continue",
          href: "/studio?analysisId=analysis-1&excludedRequirements=Zendesk&excludedRequirements=Five9",
        }}
        secondaryCta={{ label: "Resolve verification gaps in Studio", href: "/studio?analysisId=analysis-1" }}
        scoreAnalysisHref="#advanced-insights"
        readiness={{
          status: "limited",
          blocked: false,
          reasonCodes: ["personalization_limited"],
          reasons: [{ code: "personalization_limitation", message: "limited" }],
          badgeLabel: "LIMITED",
          summary: "limited",
          verificationIssues: [],
        }}
        verificationCoverage={{
          status: "partial",
          verifiedClaims: 1,
          inferredClaims: 0,
          unverifiedClaims: 2,
          supportedClaims: 1,
          unsupportedClaims: 2,
          totalClaims: 3,
          summary: "partial",
        }}
        canonicalCoverage={null}
        baselineEvidenceHref="/baseline?analysisId=analysis-1"
        predictiveUnlock={{
          unverifiedRequirements: ["Zendesk", "Five9"],
          predictedOutcome: "full",
          removeAndContinueHref:
            "/studio?analysisId=analysis-1&excludedRequirements=Zendesk&excludedRequirements=Five9",
          reviewInStudioHref: "/studio?analysisId=analysis-1",
        }}
      />,
    );

    expect(screen.getByText("Unlock full generation")).toBeInTheDocument();
    expect(
      screen.getByText(
        "You're a strong match for this role. A few unverified requirements are limiting document generation.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("- Zendesk")).toBeInTheDocument();
    expect(screen.getByText("- Five9")).toBeInTheDocument();
    expect(screen.getByText(/generation will be fully enabled/i)).toBeInTheDocument();
    expect(screen.getByText("You can restore removed requirements later.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Remove unsupported requirements and continue" })).toHaveAttribute(
      "href",
      "/studio?analysisId=analysis-1&excludedRequirements=Zendesk&excludedRequirements=Five9",
    );
    expect(screen.getByRole("link", { name: "Resolve verification gaps in Studio" })).toHaveAttribute(
      "href",
      "/studio?analysisId=analysis-1",
    );
  });

  it("discovers and ranks competitive adjacent roles with explanations and analyze routing", () => {
    const roles = discoverCompetitiveRoles({
      analysis: {
        score: 91,
        supportingSignals: ["Support operations leadership", "Escalation workflow ownership"],
        baselineEvidence: "Led customer operations and support process improvement.",
        verification_coverage: {
          supportedRequirements: ["Salesforce", "Service Cloud", "Escalation Management"],
          unverifiedRequirements: ["Zendesk"],
        },
      },
      applicationInsights: [{ type: "success", message: "You received interviews when all core requirements were verified." }],
      activeScore: 91,
    });

    expect(roles.length).toBeGreaterThan(0);
    expect(roles[0]?.rank).toBe(1);
    expect(["High", "Medium", "Stretch"]).toContain(roles[0]?.fitLevel);
    expect(roles[0]?.explanation.length).toBeGreaterThan(10);
    expect(roles[0]?.analyzeHref).toContain("/analyze?");
    expect(roles[0]?.analyzeHref).toContain("suggestedRole=");
  });
});
