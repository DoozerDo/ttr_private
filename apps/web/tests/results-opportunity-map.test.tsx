import { render, screen } from "@testing-library/react";

import {
  discoverCompetitiveRoles,
  buildStudioHrefWithExcludedRequirements,
  OpportunityMapSection,
  getOpportunityVerdict,
  getPrimaryResultsCta,
} from "@/app/(app)/results/page";
import type { GenerationReadiness, VerificationCoverage } from "@/lib/generationReadiness";

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
  it("maps >85 scores to generate CTA routed to studio", () => {
    const cta = getPrimaryResultsCta({
      activeScore: 91,
      studioHref: "/studio",
      canOpenStudio: true,
      canGenerate: true,
      reasonsBlocked: [],
      fitReviewPath: "/fit-review?jobId=job-1",
    });

    expect(cta).toMatchObject({
      label: "Open Studio to Generate",
      href: "/studio",
      disabled: false,
    });
  });

  it("maps 70-85 scores to open studio CTA", () => {
    const cta = getPrimaryResultsCta({
      activeScore: 74,
      studioHref: "/studio?analysisId=analysis-1&baselineId=base-1",
      canOpenStudio: true,
      canGenerate: false,
      reasonsBlocked: [],
      fitReviewPath: "/fit-review?jobId=job-1",
    });

    expect(cta).toMatchObject({
      label: "Open Studio",
      href: "/studio?analysisId=analysis-1&baselineId=base-1",
      disabled: false,
    });
  });

  it("maps below-70 scores to fit improvement", () => {
    const improveCta = getPrimaryResultsCta({
      activeScore: 62,
      studioHref: "/studio",
      canOpenStudio: true,
      canGenerate: false,
      reasonsBlocked: [],
      fitReviewPath: "/fit-review?jobId=job-1",
    });
    expect(improveCta).toMatchObject({
      label: "Start Fit Improvement",
      href: "/fit-review?jobId=job-1",
      disabled: false,
    });

    const cta = getPrimaryResultsCta({
      activeScore: 41,
      studioHref: "/studio",
      canOpenStudio: true,
      canGenerate: false,
      reasonsBlocked: [],
      fitReviewPath: "/fit-review?jobId=job-1",
    });

    expect(cta).toMatchObject({
      label: "Start Fit Improvement",
      href: "/fit-review?jobId=job-1",
      disabled: false,
    });
  });

  it("keeps studio routing when analysis context is included", () => {
    const cta = getPrimaryResultsCta({
      activeScore: 90,
      studioHref: "/studio?jobId=job-1&analysisId=analysis-88&baselineId=base-1&baselineVersionId=base-version-4",
      canOpenStudio: true,
      canGenerate: true,
      reasonsBlocked: [],
      fitReviewPath: "/fit-review?jobId=job-1",
    });

    expect(cta.href).toBe(
      "/studio?jobId=job-1&analysisId=analysis-88&baselineId=base-1&baselineVersionId=base-version-4",
    );
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
        primaryCta={{
          label: "Generate Resume & Cover Letter",
          href: "/studio",
          description: "You're a strong match. Move forward and generate tailored materials.",
        }}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
        canonicalCoverage={null}
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
    expect(screen.getByText("Decision summary")).toBeInTheDocument();
    expect(screen.getByText("Built from your validated baseline and role requirements.")).toBeInTheDocument();
    expect(screen.getByText("View detailed scoring breakdown")).toBeInTheDocument();
    expect(screen.getByText("Generate Resume & Cover Letter")).toBeInTheDocument();
    expect(screen.getByText("You're a strong match. Move forward and generate tailored materials.")).toBeInTheDocument();
    expect(screen.queryByText("Watchouts")).toBeNull();
    expect(screen.queryByText("Best next move")).toBeNull();
    expect(screen.queryByText("Fit")).toBeNull();
    expect(screen.queryByText("Risk")).toBeNull();
    expect(screen.getByText(/Generation readiness:\s*READY/i)).toBeInTheDocument();
    expect(screen.getByText(/Verification coverage:\s*STRONG/i)).toBeInTheDocument();
    expect(screen.getByText(/3\s*\/\s*3 verified claims/i)).toBeInTheDocument();
  });

  it("keeps the hero focused when no advantage signals are provided", () => {
    render(
      <OpportunityMapSection
        score={74}
        verdict={getOpportunityVerdict(74)}
        advantageSignals={[]}
        primaryCta={{
          label: "Open Studio",
          href: "/studio",
          description: "You're competitive. Tighten positioning before applying.",
        }}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
        canonicalCoverage={null}
        predictiveUnlock={null}
      />,
    );

    expect(screen.getByText("Decision summary")).toBeInTheDocument();
    expect(screen.queryByText("YOUR ADVANTAGE")).toBeNull();
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
        primaryCta={{
          label: "Generate Resume & Cover Letter",
          href: "/studio",
          description: "You're a strong match. Move forward and generate tailored materials.",
        }}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
        canonicalCoverage={null}
        predictiveUnlock={null}
      />,
    );

    expect(screen.getByText(/Generation readiness:\s*READY/i)).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Generate Resume & Cover Letter" });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/studio");
    expect(screen.getByTestId("results-hero-primary-cta")).toBeInTheDocument();
    expect(screen.getByTestId("results-hero-secondary-action")).toBeInTheDocument();
  });

  it("renders ResolveGapsBlock for weak-fit scores", () => {
    render(
      <OpportunityMapSection
        score={62}
        verdict={getOpportunityVerdict(62)}
        advantageSignals={["Led global support operations"]}
        primaryCta={null}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
        canonicalCoverage={null}
        predictiveUnlock={null}
        weakFitRecovery={{
          href: "/resolve-gaps?jobId=job-1&baselineId=base-1",
          gapPreview: [
            { requirement: "Salesforce", explanation: "Add concrete baseline evidence that proves this requirement." },
            { requirement: "Zendesk", explanation: "Add concrete baseline evidence that proves this requirement." },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("resolve-gaps-block")).toBeInTheDocument();
    expect(
      screen.getByText("This role needs stronger proof before generation will be useful."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resolve Gaps" })).toHaveAttribute(
      "href",
      "/resolve-gaps?jobId=job-1&baselineId=base-1",
    );
    expect(screen.queryByTestId("results-hero-primary-cta")).toBeNull();
  });

  it("does not render ResolveGapsBlock when fit score is 70 or higher", () => {
    render(
      <OpportunityMapSection
        score={74}
        verdict={getOpportunityVerdict(74)}
        advantageSignals={["Led global support operations"]}
        primaryCta={{
          label: "Open Studio",
          href: "/studio",
          description: "You're competitive. Tighten positioning before applying.",
        }}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
        canonicalCoverage={null}
        predictiveUnlock={null}
      />,
    );

    expect(screen.queryByTestId("resolve-gaps-block")).toBeNull();
    expect(screen.getByTestId("results-hero-primary-cta")).toBeInTheDocument();
  });

  it("renders strong fit limitation decision panel from canonical verification_coverage", () => {
    render(
      <OpportunityMapSection
        score={92}
        verdict={getOpportunityVerdict(92)}
        advantageSignals={["Led global support operations"]}
        primaryCta={{
          label: "Open Studio",
          href: "/studio",
          description: "You're competitive. Tighten positioning before applying.",
        }}
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
        predictiveUnlock={null}
      />,
    );

    expect(screen.getByText(/Generation readiness:\s*LIMITED/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Some requirements need stronger verification. You can still generate documents, and improving evidence will strengthen results.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Needs stronger verification: Zendesk, Five9")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Open Studio" });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "/studio");
    expect(screen.queryByRole("link", { name: "Review baseline evidence" })).toBeNull();
    expect(screen.queryByText("Open Studio (limited generation)")).toBeNull();
    expect(screen.queryByText("No canonical labels provided")).toBeNull();
    expect(screen.queryByText("None listed")).toBeNull();
  });

  it("shows evidence-depth guidance when canonical unverified requirements are empty", () => {
    render(
      <OpportunityMapSection
        score={92}
        verdict={getOpportunityVerdict(92)}
        advantageSignals={["Led global support operations"]}
        primaryCta={{
          label: "Open Studio",
          href: "/studio?analysisId=analysis-1#studio-auto-adjust-panel",
          description: "You're competitive. Tighten positioning before applying.",
        }}
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
        predictiveUnlock={null}
      />,
    );

    expect(screen.queryByText(/Needs stronger verification:/i)).toBeNull();
    expect(screen.queryByText("None listed")).toBeNull();
  });

  it("shows canonical coverage missing guidance instead of fallback guesses", () => {
    render(
      <OpportunityMapSection
        score={92}
        verdict={getOpportunityVerdict(92)}
        advantageSignals={["Led global support operations"]}
        primaryCta={{
          label: "Open Studio",
          href: "/studio?analysisId=analysis-1#studio-auto-adjust-panel",
          description: "You're competitive. Tighten positioning before applying.",
        }}
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
        predictiveUnlock={null}
      />,
    );

    expect(screen.getByText(/Generation readiness:\s*LIMITED/i)).toBeInTheDocument();
    expect(screen.queryByText(/Needs stronger verification:/i)).toBeNull();
    expect(screen.queryByText("No canonical labels provided")).toBeNull();
    expect(screen.queryByText("None listed")).toBeNull();
  });

  it("shows blocked state before click for high score + blocked readiness", () => {
    render(
      <OpportunityMapSection
        score={95}
        verdict={getOpportunityVerdict(95)}
        advantageSignals={["Led global support operations"]}
        primaryCta={{
          label: "Review Gaps",
          href: "#fit-improvement-opportunities",
          description: "This role is not a fit right now. Focus on closing core gaps.",
        }}
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
        predictiveUnlock={null}
      />,
    );

    expect(screen.getByText(/Generation readiness:\s*BLOCKED/i)).toBeInTheDocument();
    expect(screen.getByText(/0\s*\/\s*2 verified claims/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Some claims required for tailored generation could not be verified against your baseline.",
      ),
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Review Gaps" });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "#fit-improvement-opportunities");
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
          description: "You're a strong match. Move forward and generate tailored materials.",
        }}
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
        predictiveUnlock={{
          unverifiedRequirements: ["Zendesk", "Five9"],
          predictedOutcome: "full",
          removeAndContinueHref:
            "/studio?analysisId=analysis-1&excludedRequirements=Zendesk&excludedRequirements=Five9",
          reviewInStudioHref: "/studio?analysisId=analysis-1",
        }}
      />,
    );

    expect(screen.getByText(/Generation readiness:\s*LIMITED/i)).toBeInTheDocument();
    expect(screen.getByText(/can fully unlock generation/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Remove unsupported requirements and continue" })).toHaveAttribute(
      "href",
      "/studio?analysisId=analysis-1&excludedRequirements=Zendesk&excludedRequirements=Five9",
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
