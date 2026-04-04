import { resolveDisplayedFitScore } from "@/app/(app)/results/page";

describe("results score breakdown display", () => {
  it("prefers score_breakdown total for displayed fit score", () => {
    const score = resolveDisplayedFitScore({
      baselineId: "b-1",
      jobId: "j-1",
      overallScore: 82,
      score: 82,
      score_breakdown: {
        total_score: 79.5,
        dimensions: [
          {
            key: "role_scope_and_seniority",
            label: "Role Scope and Seniority",
            score: 20,
            weight: 25,
          },
          {
            key: "support_operations_and_process_rigor",
            label: "Support Operations and Process Rigor",
            score: 20,
            weight: 25,
          },
          {
            key: "tooling_and_platform_experience",
            label: "Tooling and Platform Experience",
            score: 16,
            weight: 20,
          },
          {
            key: "domain_and_business_context",
            label: "Domain and Business Context",
            score: 12,
            weight: 15,
          },
          {
            key: "change_leadership_and_customer_advocacy",
            label: "Change Leadership and Customer Advocacy",
            score: 11.5,
            weight: 15,
          },
        ],
      },
    });

    expect(score).toBe(79.5);
  });
});

