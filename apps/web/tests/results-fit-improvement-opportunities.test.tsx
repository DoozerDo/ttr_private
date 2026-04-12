import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OpportunityMapSection,
  getOpportunityVerdict,
} from "@/app/(app)/results/page";
import { FitImprovementOpportunities } from "@/app/(app)/results/components/FitImprovementOpportunities";
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

const buildNextAction = (action: NextAction["type"]): NextAction => ({
  type: action,
  label: "Action",
  route: "/studio",
  reason: "Description",
});

const reliabilityFacts = {
  baselineCompleteness: "Structured experience completeness is still being established.",
  matchedSignals: 3,
  scoreImproved: true,
  gapsResolvable: true,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Results fit improvement opportunities", () => {
  it("keeps support operations out of What to fix when the same baseline appears as a strength", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          improvementOpportunities: [
            {
              categoryKey: "support_operations",
              categoryLabel: "Support Operations",
              currentSignal: "Support operations evidence is already verified.",
              roleExpectation: "Own support operations and escalation management.",
              estimatedScore: 41,
              delta: 12,
              explanation: "This should be suppressed.",
            },
          ],
        }),
      }),
    );

    render(
      <div>
        <OpportunityMapSection
          score={87}
          verdict={getOpportunityVerdict(87)}
          nextAction={buildNextAction("studio")}
          advantageSignals={["Owned global incident management for customer operations"]}
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
          reliabilityFacts={reliabilityFacts}
        />
        <FitImprovementOpportunities
          assessmentId="analysis-1"
          compact
          fallbackInsights={[]}
          supportingSignals={[
            "Owned global incident management for customer operations",
            "Led support and development teams across NA, EMEA, and APAC",
          ]}
          baselineEvidence="Owned global incident and escalation management for customer operations supporting Fortune 500 accounts."
          summary="Strong support operations evidence."
        />
      </div>,
    );

    await waitFor(() => expect(screen.queryByText("Support Operations")).toBeNull());
    expect(screen.queryByRole("link", { name: "Start Fit Review" })).toBeNull();
    expect(screen.getByText("You'll address these gaps in Fit Review.")).toBeInTheDocument();
    expect(screen.queryByText(/Category:/i)).toBeNull();
    expect(screen.queryByText(/Domain:/i)).toBeNull();
  });

  it("keeps change leadership out of What to fix when leadership-at-scale evidence is already present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          improvementOpportunities: [
            {
              categoryKey: "change_leadership",
              categoryLabel: "Change Leadership and Customer Advocacy",
              currentSignal: "Leadership at scale is already verified.",
              roleExpectation: "Lead transformation and operating model change.",
              estimatedScore: 38,
              delta: 14,
              explanation: "This should be suppressed.",
            },
          ],
        }),
      }),
    );

    render(
      <FitImprovementOpportunities
        assessmentId="analysis-2"
        compact
        fallbackInsights={[]}
        supportingSignals={[
          "Led support and development teams of fifty plus across NA, EMEA, and APAC",
          "Managed cross-functional support teams at global scale",
        ]}
        baselineEvidence="Drove rollout of a new support operating model across regions."
        summary="Leadership-at-scale and rollout evidence."
      />,
    );

    await waitFor(() => expect(screen.queryByText("Change Leadership and Customer Advocacy")).toBeNull());
    expect(screen.queryByText(/Category:/i)).toBeNull();
    expect(screen.queryByText(/Domain:/i)).toBeNull();
  });

  it("keeps unsupported categories visible when no equivalent evidence exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          improvementOpportunities: [
            {
              categoryKey: "analytics_strategy",
              categoryLabel: "Analytics Strategy",
              currentSignal: "Support queue evidence only.",
              roleExpectation: "Own analytics strategy and measurement design.",
              estimatedScore: 29,
              delta: 7,
              explanation: "This category should remain visible.",
            },
          ],
        }),
      }),
    );

    render(
      <FitImprovementOpportunities
        assessmentId="analysis-3"
        compact
        fallbackInsights={[]}
        supportingSignals={["Managed support queue triage"]}
        baselineEvidence="Handled support queue triage."
        summary="Operational support evidence without analytics proof."
      />,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Clarify this example", level: 3 })).toBeTruthy());
    expect(screen.getByText("You'll address these gaps in Fit Review.")).toBeInTheDocument();
    expect(screen.queryByText("Analytics Strategy")).toBeNull();
    expect(screen.queryByText(/Category:/i)).toBeNull();
    expect(screen.queryByText(/Domain:/i)).toBeNull();
    expect(screen.queryByText("Verify the missing evidence")).toBeNull();
  });
});
