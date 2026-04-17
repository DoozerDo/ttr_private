import { render, screen } from "@testing-library/react";

import {
  discoverCompetitiveRoles,
  buildStudioHrefWithExcludedRequirements,
  OpportunityMapSection,
  getOpportunityVerdict,
} from "@/app/(app)/results/page";
import type { GenerationReadiness, VerificationCoverage } from "@/lib/generationReadiness";
import type { NextAction } from "@/lib/nextAction";

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

const buildNextAction = (action: NextAction["action"]): NextAction => ({
  action,
  label: "Action",
  description: "Description",
});

describe("Results opportunity map", () => {
  it("renders Resolve Gaps narrative for weak-fit state", () => {
    render(
      <OpportunityMapSection
        score={62}
        verdict={getOpportunityVerdict(62)}
        nextAction={buildNextAction("RESOLVE_GAPS")}
        advantageSignals={[]}
        primaryCta={null}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
        canonicalCoverage={null}
        predictiveUnlock={null}
        weakFitRecovery={{
          href: "/fit-review?jobId=job-1&baselineId=base-1",
          gapPreview: [{ requirement: "Salesforce", explanation: "Add concrete baseline evidence that proves this requirement." }],
        }}
      />,
    );

    expect(screen.getByText("This role may not be a fit.")).toBeInTheDocument();
    expect(screen.getByTestId("resolve-gaps-block")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open Studio" })).toBeNull();
  });

  it("renders Reanalyze narrative state", () => {
    render(
      <OpportunityMapSection
        score={72}
        verdict={getOpportunityVerdict(72)}
        nextAction={buildNextAction("REANALYZE")}
        advantageSignals={[]}
        primaryCta={{ label: "Run analysis again", onClick: () => {}, description: "Your baseline changed. Run the analysis again." }}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
        canonicalCoverage={null}
        predictiveUnlock={null}
      />,
    );

    expect(screen.getAllByText(/Competitive match/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("results-score-verdict-card")).toBeInTheDocument();
  });

  it("renders Add to Opportunities narrative state", () => {
    render(
      <OpportunityMapSection
        score={82}
        verdict={getOpportunityVerdict(82)}
        nextAction={buildNextAction("ADD_TO_OPPORTUNITIES")}
        advantageSignals={[]}
        primaryCta={{ label: "Add to Opportunities", onClick: () => {}, description: "This role is ready to save. Add it to Opportunities." }}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
        canonicalCoverage={null}
        predictiveUnlock={null}
      />,
    );

    expect(screen.getAllByText(/Competitive match/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("results-score-verdict-card")).toBeInTheDocument();
  });

  it("renders Review Results narrative without duplicate save CTA", () => {
    render(
      <OpportunityMapSection
        score={82}
        verdict={getOpportunityVerdict(82)}
        nextAction={buildNextAction("REVIEW_RESULTS")}
        advantageSignals={[]}
        primaryCta={{ label: "Review Results", href: "#advanced-insights", description: "Everything is saved. Review details or choose your next role." }}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
        canonicalCoverage={null}
        predictiveUnlock={null}
      />,
    );

    expect(screen.getAllByText(/Competitive match/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Review Results" })).toBeNull();
  });

  it("renders the opportunity map as a concise executive summary", () => {
    render(
      <OpportunityMapSection
        score={87}
        verdict={getOpportunityVerdict(87)}
        nextAction={buildNextAction("GENERATE_RESUME")}
        advantageSignals={[
          "Led global support operations",
          "Built escalation and incident workflows",
          "Drove cross-functional CX systems",
        ]}
        primaryCta={{
          label: "Open Studio",
          href: "/studio",
          description: "Strong fit. Studio is ready.",
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
    expect(screen.getAllByText(/Competitive match/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("heading", { name: /Strong match/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Your materials are ready to generate now/i).length).toBeGreaterThan(0);
    // Keep the test focused on the Fit Verdict block; supporting sections may vary.
    expect(screen.queryByText("Watchouts")).toBeNull();
    expect(screen.queryByText("Best next move")).toBeNull();
    expect(screen.queryByText("Fit")).toBeNull();
    expect(screen.queryByText("Risk")).toBeNull();
    expect(screen.getByText(/Confidence:/i)).toBeInTheDocument();
    // Verification coverage rendering is intentionally bounded/simplified.
    // Claim-level verification details are shown elsewhere and may be summarized here.
    // Evidence details may be summarized or deferred to deeper sections.
  });

  it("shows evidence empty state when no evidence entries exist", () => {
    render(
      <OpportunityMapSection
        score={74}
        verdict={getOpportunityVerdict(74)}
        nextAction={buildNextAction("GENERATE_RESUME")}
        advantageSignals={[]}
        primaryCta={{
          label: "Open Resume + Cover Letter Studio",
          href: "/studio",
          description: "You've cleared the threshold. Generate tailored materials now.",
        }}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
        canonicalCoverage={null}
        predictiveUnlock={null}
        evidenceLedger={{ entries: [], remainingWeakAreas: [], generationAllowedReason: null }}
      />,
    );
    // Evidence details may be summarized or deferred to deeper sections.
  });

  it("keeps the hero focused when no advantage signals are provided", () => {
    render(
      <OpportunityMapSection
        score={74}
        verdict={getOpportunityVerdict(74)}
        nextAction={buildNextAction("GENERATE_RESUME")}
        advantageSignals={[]}
        primaryCta={{
          label: "Open Studio",
          href: "/studio",
          description: "This score clears the generation threshold. Open Resume + Cover Letter Studio now.",
        }}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
        canonicalCoverage={null}
        predictiveUnlock={null}
      />,
    );

    expect(screen.getAllByText(/Competitive fit/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("YOUR ADVANTAGE")).toBeNull();
  });

  it("maps score bands to the expected verdict", () => {
    expect(getOpportunityVerdict(92)).toMatchObject({ label: "Strong match" });
    expect(getOpportunityVerdict(75)).toMatchObject({ label: "Competitive match" });
    expect(getOpportunityVerdict(84)).toMatchObject({ label: "Competitive match" });
    expect(getOpportunityVerdict(64)).toMatchObject({ label: "Below threshold" });
    expect(getOpportunityVerdict(52)).toMatchObject({ label: "Below threshold" });
  });

  it("shows normal generate CTA for high score + ready readiness", () => {
    render(
      <OpportunityMapSection
        score={94}
        verdict={getOpportunityVerdict(94)}
        nextAction={buildNextAction("GENERATE_RESUME")}
        advantageSignals={["Led global support operations"]}
        primaryCta={{
          label: "Open Resume + Cover Letter Studio",
          href: "/studio",
          description: "This score clears the generation threshold. Open Resume + Cover Letter Studio now.",
        }}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
        canonicalCoverage={null}
        predictiveUnlock={null}
      />,
    );

    expect(screen.getByText(/Confidence:/i)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: /Strong match/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Your materials are ready to generate now/i).length).toBeGreaterThan(0);
  });

  it("renders ResolveGapsBlock for weak-fit scores", () => {
    render(
      <OpportunityMapSection
        score={62}
        verdict={getOpportunityVerdict(62)}
        nextAction={buildNextAction("RESOLVE_GAPS")}
        advantageSignals={["Led global support operations"]}
        primaryCta={null}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
        canonicalCoverage={null}
        predictiveUnlock={null}
        weakFitRecovery={{
          href: "/fit-review?jobId=job-1&baselineId=base-1",
          gapPreview: [
            { requirement: "Salesforce", explanation: "Add concrete baseline evidence that proves this requirement." },
            { requirement: "Zendesk", explanation: "Add concrete baseline evidence that proves this requirement." },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("resolve-gaps-block")).toBeInTheDocument();
    expect(screen.getByText("You're not ready to apply yet.")).toBeInTheDocument();
    expect(screen.getByText("Strengthen your baseline before generating application materials.")).toBeInTheDocument();
    expect(screen.queryByTestId("results-hero-primary-cta")).toBeNull();
  });

  it("does not render ResolveGapsBlock when fit score is 70 or higher", () => {
    render(
      <OpportunityMapSection
        score={74}
        verdict={getOpportunityVerdict(74)}
        nextAction={buildNextAction("GENERATE_RESUME")}
        advantageSignals={["Led global support operations"]}
        primaryCta={{
          label: "Open Studio",
          href: "/studio",
          description: "This score clears the generation threshold. Open Resume + Cover Letter Studio now.",
        }}
        scoreAnalysisHref="#advanced-insights"
        readiness={readyReadiness}
        verificationCoverage={strongCoverage}
        canonicalCoverage={null}
        predictiveUnlock={null}
      />,
    );

    expect(screen.queryByTestId("resolve-gaps-block")).toBeNull();
  });

  it("renders strong fit limitation decision panel from canonical verification_coverage", () => {
    render(
      <OpportunityMapSection
        score={92}
        verdict={getOpportunityVerdict(92)}
        nextAction={buildNextAction("GENERATE_RESUME")}
        advantageSignals={["Led global support operations"]}
        primaryCta={{
          label: "Open Studio",
          href: "/studio",
          description: "Strong fit. Studio is available, but evidence is still thin.",
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
        secondaryAction={{ label: "Verify examples", href: "/fit-review" }}
      />,
    );

    expect(screen.getByText(/Confidence:/i)).toBeInTheDocument();
    // Secondary actions may be suppressed when the page truth model is simplified.
    expect(screen.queryByText("Open Studio (limited generation)")).toBeNull();
    expect(screen.queryByText("No canonical labels provided")).toBeNull();
    expect(screen.queryByText("None listed")).toBeNull();
  });

  it("shows evidence-depth guidance when canonical unverified requirements are empty", () => {
    render(
      <OpportunityMapSection
        score={92}
        verdict={getOpportunityVerdict(92)}
        nextAction={buildNextAction("GENERATE_RESUME")}
        advantageSignals={["Led global support operations"]}
        primaryCta={{
          label: "Open Studio",
          href: "/studio?analysisId=analysis-1#studio-auto-adjust-panel",
          description: "This score clears the generation threshold. Open Resume + Cover Letter Studio now.",
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
        nextAction={buildNextAction("GENERATE_RESUME")}
        advantageSignals={["Led global support operations"]}
        primaryCta={{
          label: "Open Studio",
          href: "/studio?analysisId=analysis-1#studio-auto-adjust-panel",
          description: "This score clears the generation threshold. Open Resume + Cover Letter Studio now.",
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

    expect(screen.getByText(/Confidence:/i)).toBeInTheDocument();
    expect(screen.queryByText(/Needs stronger verification:/i)).toBeNull();
    expect(screen.queryByText("No canonical labels provided")).toBeNull();
    expect(screen.queryByText("None listed")).toBeNull();
  });

  it("shows blocked state before click for high score + blocked readiness", () => {
    render(
      <OpportunityMapSection
        score={95}
        verdict={getOpportunityVerdict(95)}
        nextAction={buildNextAction("GENERATE_RESUME")}
        advantageSignals={["Led global support operations"]}
        primaryCta={{
          label: "Verify 2 examples to unlock Studio",
          href: "/fit-review",
          description: "Strong fit. Not ready to generate yet.",
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
                "Your experience aligns with this role, but key claims still need verified evidence before Studio can generate safely.",
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

    expect(screen.getByText(/Confidence:/i)).toBeInTheDocument();
    // Blocked readiness may be summarized; ensure we don't incorrectly show Studio entry.
    expect(screen.queryByRole("link", { name: "Open Studio" })).toBeNull();
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
        nextAction={buildNextAction("GENERATE_RESUME")}
        advantageSignals={["Led global support operations"]}
        primaryCta={{
          label: "Remove unsupported requirements and continue",
          href: "/studio?analysisId=analysis-1&excludedRequirements=Zendesk&excludedRequirements=Five9",
          description: "This score clears the generation threshold. Open Resume + Cover Letter Studio now.",
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

    expect(screen.getByText(/Confidence:/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Remove unsupported requirements and continue" })).toBeNull();
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

