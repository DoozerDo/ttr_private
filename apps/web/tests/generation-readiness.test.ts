import {
  aggregateVerificationIssues,
  combineGenerationReadinessFromServer,
  deriveVerificationCoverage,
  getGenerationReadiness,
  sanitizeClaims,
  type VerificationIssue,
} from "@/lib/generationReadiness";

describe("generation readiness model", () => {
  it("returns ready state when no compliance constraints exist", () => {
    const readiness = getGenerationReadiness(
      {
        score: 91,
        compliance_flags: [],
      },
      null,
    );

    expect(readiness.status).toBe("ready");
    expect(readiness.badgeLabel).toBe("READY");
    expect(readiness.summary).toBe("Generation is ready for this scored analysis context.");
    expect(readiness.verificationIssues).toEqual([]);
  });

  it("returns limited state for personalization constraints", () => {
    const readiness = getGenerationReadiness(
      {
        score: 92,
        compliance_flags: [{ code: "limited_personalization", severity: "warn" }],
      },
      null,
    );

    expect(readiness.status).toBe("limited");
    expect(readiness.badgeLabel).toBe("LIMITED");
    expect(readiness.reasons[0]?.code).toBe("personalization_limitation");
    expect(readiness.reasons[0]?.message).toBe(
      "This role scored highly, but document generation is currently limited by verification constraints.",
    );
    expect(readiness.summary.toLowerCase()).not.toContain("baseline issue");
  });

  it("returns blocked state for blocker severity constraints", () => {
    const readiness = getGenerationReadiness(
      {
        score: 96,
        compliance_flags: [{ code: "missing_baseline_support", severity: "block" }],
      },
      null,
    );

    expect(readiness.status).toBe("blocked");
    expect(readiness.badgeLabel).toBe("BLOCKED");
    expect(readiness.reasons.some((reason) => reason.code === "full_block")).toBe(true);
  });

  it("maps preflight blocked state from real server compliance outputs", () => {
    const readiness = combineGenerationReadinessFromServer(
      { status: "blocked", reasons: [{ code: "full_block", message: "blocked" }] },
      { status: "ready", reasons: [] },
    );
    expect(readiness.status).toBe("blocked");
  });

  it("maps preflight warning-only state to limited", () => {
    const readiness = combineGenerationReadinessFromServer(
      {
        status: "limited",
        reasons: [
          {
            code: "personalization_limitation",
            message:
              "This role scored highly, but document generation is currently limited by verification constraints.",
          },
        ],
      },
      { status: "ready", reasons: [] },
    );
    expect(readiness.status).toBe("limited");
  });

  it("maps preflight clean state to ready", () => {
    const readiness = combineGenerationReadinessFromServer(
      { status: "ready", reasons: [] },
      { status: "ready", reasons: [] },
    );
    expect(readiness.status).toBe("ready");
  });

  it("maps blocked technology claim to specific actionable verification issue", () => {
    const readiness = combineGenerationReadinessFromServer(
      {
        status: "blocked",
        reasons: [{ code: "full_block", message: "blocked" }],
        compliance_flags: [
          {
            code: "fictional_technology",
            severity: "block",
            message: 'Unsupported claim "Salesforce Service Cloud administration".',
            evidence: [{ generated: "Salesforce Service Cloud administration" }],
          },
        ],
      },
      { status: "ready", reasons: [], compliance_flags: [] },
    );

    expect(readiness.status).toBe("blocked");
    expect(readiness.verificationIssues[0]).toMatchObject({
      code: "unsupported_technology_claim",
      severity: "block",
      source: "resume_generation",
      claim: "Salesforce Service Cloud administration",
    });
    expect(readiness.verificationIssues[0]?.recommendedAction).toContain(
      "Remove unsupported technology emphasis",
    );
  });

  it("ignores company-typed fictional_technology flags for both resume and cover-letter paths", () => {
    const readiness = combineGenerationReadinessFromServer(
      {
        status: "blocked",
        reasons: [{ code: "full_block", message: "blocked" }],
        compliance_flags: [
          {
            code: "fictional_technology",
            severity: "block",
            message: 'Technology "CenturyLink" not found in baseline.',
            evidence: [
              {
                generated: "CenturyLink",
                generatedClaim: { text: "CenturyLink", type: "company" },
              },
            ],
          },
        ],
      },
      {
        status: "blocked",
        reasons: [{ code: "full_block", message: "blocked" }],
        compliance_flags: [
          {
            code: "fictional_technology",
            severity: "block",
            message: 'Technology "SentinelOne" not found in baseline.',
            evidence: [
              {
                generated: "SentinelOne",
                generatedClaim: { text: "SentinelOne", type: "company" },
              },
            ],
          },
        ],
      },
    );

    expect(
      readiness.verificationIssues.some(
        (issue) => issue.code === "unsupported_technology_claim",
      ),
    ).toBe(false);
  });

  it("maps limited personalization to warning issue with next step", () => {
    const readiness = combineGenerationReadinessFromServer(
      {
        status: "limited",
        reasons: [
          {
            code: "personalization_limitation",
            message:
              "This role scored highly, but document generation is currently limited by verification constraints.",
          },
        ],
        compliance_flags: [{ code: "limited_personalization", severity: "warn" }],
      },
      { status: "ready", reasons: [], compliance_flags: [] },
    );

    expect(readiness.status).toBe("limited");
    expect(readiness.verificationIssues[0]).toMatchObject({
      code: "role_targeting_emphasis_exceeds_support",
      severity: "warn",
    });
    expect(readiness.verificationIssues[0]?.recommendedAction).toContain(
      "Reduce targeting emphasis",
    );
  });

  it("does not generically blame baseline for non-baseline explicit issue types", () => {
    const readiness = combineGenerationReadinessFromServer(
      {
        status: "limited",
        reasons: [{ code: "personalization_limitation", message: "limited" }],
        compliance_flags: [{ code: "scope_inflation", severity: "warn" }],
      },
      { status: "ready", reasons: [], compliance_flags: [] },
    );

    const explanation = readiness.verificationIssues[0]?.explanation ?? "";
    expect(explanation.toLowerCase()).not.toContain("your baseline has issues");
  });

  it("derives verification coverage status directly from readiness status", () => {
    const strong = deriveVerificationCoverage({
      status: "ready",
      blocked: false,
      reasonCodes: [],
      reasons: [],
      badgeLabel: "READY",
      summary: "ok",
      verificationIssues: [],
    });
    const partial = deriveVerificationCoverage({
      status: "limited",
      blocked: false,
      reasonCodes: ["limited"],
      reasons: [{ code: "personalization_limitation", message: "limited" }],
      badgeLabel: "LIMITED",
      summary: "limited",
      verificationIssues: [
        {
          code: "role_targeting_emphasis_exceeds_support",
          severity: "warn",
          claim: null,
          source: "targeting_context",
          explanation: "limited",
          sourceContext: null,
          recommendedAction: "refine",
        },
      ],
    });
    const weak = deriveVerificationCoverage({
      status: "blocked",
      blocked: true,
      reasonCodes: ["block"],
      reasons: [{ code: "full_block", message: "blocked" }],
      badgeLabel: "BLOCKED",
      summary: "blocked",
      verificationIssues: [
        {
          code: "unsupported_technology_claim",
          severity: "block",
          claim: "x",
          source: "resume_generation",
          explanation: "blocked",
          sourceContext: null,
          recommendedAction: "adjust",
        },
      ],
    });
    expect(strong.status).toBe("strong");
    expect(partial.status).toBe("partial");
    expect(weak.status).toBe("weak");
  });

  it("aggregates to max three primary issues and groups the remainder", () => {
    const issues: VerificationIssue[] = Array.from({ length: 20 }, (_, index) => ({
      code: index % 2 === 0 ? "unsupported_technology_claim" : "generation_overreach",
      severity: index % 3 === 0 ? "block" : "warn",
      claim: `Claim ${index}`,
      source: index % 2 === 0 ? "resume_generation" : "cover_letter_generation",
      explanation: "x",
      sourceContext: null,
      recommendedAction: "y",
    }));

    const aggregated = aggregateVerificationIssues(issues);
    expect(aggregated.primary).toHaveLength(3);
    expect(aggregated.grouped.length).toBeGreaterThan(0);
    const groupedCount = aggregated.grouped.reduce((sum, item) => sum + item.count, 0);
    expect(groupedCount).toBe(17);
  });

  it("filters numeric-only claims and extraction-noise claims", () => {
    const issues: VerificationIssue[] = [
      {
        code: "unsupported_technology_claim",
        severity: "block",
        claim: "2022",
        source: "resume_generation",
        explanation: "x",
        sourceContext: null,
        recommendedAction: "y",
      },
      {
        code: "verification_constraint",
        severity: "warn",
        claim: "--",
        source: "targeting_context",
        explanation: "x",
        sourceContext: null,
        recommendedAction: "y",
      },
      {
        code: "missing_baseline_evidence",
        severity: "block",
        claim: "Salesforce",
        source: "resume_generation",
        explanation: "x",
        sourceContext: null,
        recommendedAction: "y",
      },
    ];

    const aggregated = aggregateVerificationIssues(issues);
    expect(aggregated.primary).toHaveLength(1);
    expect(aggregated.primary[0]?.claim).toBe("Salesforce");
  });

  it("deduplicates identical issues before prioritization", () => {
    const duplicate: VerificationIssue = {
      code: "unsupported_technology_claim",
      severity: "block",
      claim: "Salesforce",
      source: "resume_generation",
      explanation: "x",
      sourceContext: null,
      recommendedAction: "y",
    };

    const aggregated = aggregateVerificationIssues([duplicate, duplicate, duplicate]);
    expect(aggregated.primary).toHaveLength(1);
    expect(aggregated.grouped).toHaveLength(0);
  });

  it("sanitizes invalid claims before verification issue mapping", () => {
    expect(sanitizeClaims(["206-949-1418"])).toEqual([]);
    expect(sanitizeClaims(["2018"])).toEqual([]);
    expect(sanitizeClaims(["2018Support"])).toEqual([]);
    expect(sanitizeClaims(["billing-impacting"])).toEqual([]);
    expect(sanitizeClaims(["client-impacting"])).toEqual([]);
    expect(sanitizeClaims(["cross-team"])).toEqual([]);
    expect(sanitizeClaims(["first-response"])).toEqual([]);
    expect(sanitizeClaims(["high-volume"])).toEqual([]);
    expect(sanitizeClaims(["customer-facing"])).toEqual([]);
    expect(sanitizeClaims(["Salesforce"])).toEqual(["Salesforce"]);
    expect(sanitizeClaims(["Zendesk"])).toEqual(["Zendesk"]);
  });

  it("ensures top three aggregated issues contain only valid actionable claims", () => {
    const readiness = combineGenerationReadinessFromServer(
      {
        status: "blocked",
        reasons: [{ code: "full_block", message: "blocked" }],
        compliance_flags: [
          { code: "fictional_technology", severity: "block", message: '"206-949-1418"', evidence: [{ generated: "206-949-1418" }] },
          { code: "fictional_technology", severity: "block", message: '"2018"', evidence: [{ generated: "2018" }] },
          { code: "fictional_technology", severity: "block", message: '"2018Support"', evidence: [{ generated: "2018Support" }] },
          { code: "fictional_technology", severity: "block", message: '"Salesforce"', evidence: [{ generated: "Salesforce" }] },
          { code: "scope_inflation", severity: "block", message: '"Led global support organization of 200+ engineers"', evidence: [{ generated: "Led global support organization of 200+ engineers" }] },
          { code: "missing_baseline_support", severity: "warn", message: '"Service Cloud administration"', evidence: [{ generated: "Service Cloud administration" }] },
        ],
      },
      { status: "ready", reasons: [], compliance_flags: [] },
    );

    const aggregated = aggregateVerificationIssues(readiness.verificationIssues);
    const claims = aggregated.primary.map((issue) => issue.claim);
    expect(aggregated.primary).toHaveLength(3);
    expect(claims).toContain("Salesforce");
    expect(claims).toContain("Led global support organization of 200+ engineers");
    expect(claims).toContain("Service Cloud administration");
    expect(claims).not.toContain("206-949-1418");
    expect(claims).not.toContain("2018");
    expect(claims).not.toContain("2018Support");
  });
});
