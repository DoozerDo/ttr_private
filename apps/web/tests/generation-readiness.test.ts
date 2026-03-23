import {
  aggregateVerificationIssues,
  combineGenerationReadinessFromServer,
  deriveVerificationCoverage,
  reconcileReadinessWithClaimVerifications,
  getGenerationReadiness,
  normalizeUserFacingClaimLabel,
  normalizeUserFacingRequirementLabel,
  sanitizeClaims,
  type VerificationIssue,
} from "@/lib/generationReadiness";
import { normalizeClaimVerifications } from "@/lib/claimVerification";

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
      "Remove unsupported platform emphasis",
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

  it("uses canonical claim statuses for supported claim counts when provided", () => {
    const readiness = combineGenerationReadinessFromServer(
      {
        status: "blocked",
        reasons: [{ code: "full_block", message: "blocked" }],
        compliance_flags: [
          {
            code: "fictional_technology",
            severity: "block",
            message: 'Unsupported claim "Salesforce".',
            evidence: [{ generated: "Salesforce" }],
          },
        ],
      },
      { status: "ready", reasons: [], compliance_flags: [] },
    );

    const claimStatuses = normalizeClaimVerifications([
      {
        key: "leadership-ops",
        label: "Leadership and support operations",
        category: "process",
        sourceType: "job_required",
        status: "VERIFIED",
        evidenceRefs: ["led support operations"],
        generationBlocking: false,
        scoreWeight: 1,
      },
      {
        key: "zendesk-adjacent",
        label: "Zendesk-adjacent support stack",
        category: "tooling",
        sourceType: "job_preferred",
        status: "INFERRED",
        evidenceRefs: ["ticketing system"],
        generationBlocking: false,
        scoreWeight: 0.4,
      },
      {
        key: "salesforce",
        label: "Salesforce",
        category: "platform",
        sourceType: "job_required",
        status: "UNVERIFIED",
        evidenceRefs: [],
        generationBlocking: true,
        scoreWeight: 0,
      },
    ]);

    const coverage = deriveVerificationCoverage(readiness, claimStatuses);
    expect(coverage.supportedClaims).toBe(1);
    expect(coverage.unsupportedClaims).toBe(1);
    expect(coverage.totalClaims).toBe(3);
    expect(coverage.status).toBe("weak");
  });

  it("normalizes canonical claim payloads with flexible field casing and name fallback", () => {
    const claims = normalizeClaimVerifications([
      {
        name: "salesforce",
        status: "verified",
        category: "platform",
        sourceType: "job_required",
      },
    ]);

    expect(claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "salesforce",
          label: "salesforce",
          status: "VERIFIED",
        }),
      ]),
    );
  });

  it("maps equivalent canonical statuses into inferred adjacent support", () => {
    const claims = normalizeClaimVerifications([
      {
        key: "salesforce",
        label: "Salesforce",
        status: "EQUIVALENT",
      },
    ]);

    expect(claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "salesforce",
          status: "INFERRED",
        }),
      ]),
    );
  });

  it("removes unresolved requirement issues when canonical tooling claims mark them verified", () => {
    const readiness = combineGenerationReadinessFromServer(
      {
        status: "blocked",
        reasons: [{ code: "full_block", message: "blocked" }],
        compliance_flags: [
          {
            code: "fictional_technology",
            severity: "block",
            message: 'Unsupported claim "Salesforce".',
            evidence: [{ generated: "Salesforce" }],
          },
        ],
      },
      { status: "ready", reasons: [], compliance_flags: [] },
    );

    const claims = normalizeClaimVerifications([
      {
        key: "salesforce",
        label: "Salesforce",
        category: "platform",
        sourceType: "job_required",
        status: "VERIFIED",
        evidenceRefs: ["Salesforce Service Cloud"],
        generationBlocking: false,
        scoreWeight: 1,
      },
    ]);

    const reconciled = reconcileReadinessWithClaimVerifications(readiness, claims);
    expect(reconciled.verificationIssues).toEqual([]);
    expect(reconciled.status).toBe("ready");
    expect(reconciled.blocked).toBe(false);
  });

  it("treats Salesforce equivalent support as adjacent and not unverified in coverage and issue list", () => {
    const readiness = combineGenerationReadinessFromServer(
      {
        status: "blocked",
        reasons: [{ code: "full_block", message: "blocked" }],
        compliance_flags: [
          {
            code: "fictional_technology",
            severity: "block",
            message: 'Unsupported claim "Salesforce".',
            evidence: [{ generated: "Salesforce" }],
          },
        ],
      },
      { status: "ready", reasons: [], compliance_flags: [] },
    );

    const claims = normalizeClaimVerifications([
      {
        key: "salesforce",
        label: "Salesforce",
        category: "platform",
        sourceType: "job_required",
        status: "INFERRED",
        evidenceRefs: ["Equivalent CRM capability"],
        generationBlocking: false,
        scoreWeight: 0.4,
      },
    ]);

    const reconciled = reconcileReadinessWithClaimVerifications(readiness, claims);
    const coverage = deriveVerificationCoverage(reconciled, claims);
    expect(reconciled.verificationIssues).toEqual([]);
    expect(coverage.verifiedClaims).toBe(0);
    expect(coverage.inferredClaims).toBe(1);
    expect(coverage.unverifiedClaims).toBe(0);
  });

  it("keeps truly missing tools as unverified limitations", () => {
    const readiness = combineGenerationReadinessFromServer(
      {
        status: "blocked",
        reasons: [{ code: "full_block", message: "blocked" }],
        compliance_flags: [
          {
            code: "fictional_technology",
            severity: "block",
            message: 'Unsupported claim "Five9".',
            evidence: [{ generated: "Five9" }],
          },
        ],
      },
      { status: "ready", reasons: [], compliance_flags: [] },
    );

    const claims = normalizeClaimVerifications([
      {
        key: "five9",
        label: "Five9",
        category: "platform",
        sourceType: "job_required",
        status: "UNVERIFIED",
        evidenceRefs: [],
        generationBlocking: true,
        scoreWeight: 0,
      },
    ]);

    const reconciled = reconcileReadinessWithClaimVerifications(readiness, claims);
    const coverage = deriveVerificationCoverage(reconciled, claims);
    expect(reconciled.verificationIssues.length).toBeGreaterThan(0);
    expect(reconciled.verificationIssues[0]?.claim).toBe("Five9");
    expect(coverage.unverifiedClaims).toBe(1);
  });

  it("suppresses machine-ish claim labels while preserving named technologies", () => {
    expect(normalizeUserFacingClaimLabel("multi-system")).toBeNull();
    expect(normalizeUserFacingClaimLabel("Salesforce")).toBe("Salesforce");
    expect(normalizeUserFacingClaimLabel("Five9")).toBe("Five9");
    expect(normalizeUserFacingClaimLabel("")).toBeNull();
    expect(normalizeUserFacingClaimLabel("   ")).toBeNull();
    expect(normalizeUserFacingClaimLabel("!@#")).toBeNull();
  });

  it("normalizes self-service labels only when context safely supports a fuller phrase", () => {
    expect(
      normalizeUserFacingRequirementLabel("self-service", {
        sourceContext: "Built customer portal flows and customer FAQs",
      }),
    ).toBe("Customer self-service");
    expect(
      normalizeUserFacingRequirementLabel("self-service", {
        sourceContext: "Improved support queue deflection and ticket automation",
      }),
    ).toBe("Self-service support");
    expect(normalizeUserFacingRequirementLabel("self-service", {})).toBeNull();
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

  it("suppresses unlabeled issues from primary cards and folds them into grouped limitations", () => {
    const issues: VerificationIssue[] = [
      {
        code: "missing_baseline_evidence",
        severity: "block",
        claim: "",
        source: "resume_generation",
        explanation: "x",
        sourceContext: null,
        recommendedAction: "y",
      },
      {
        code: "unsupported_technology_claim",
        severity: "block",
        claim: "multi-system",
        source: "resume_generation",
        explanation: "x",
        sourceContext: null,
        recommendedAction: "y",
      },
      {
        code: "unsupported_technology_claim",
        severity: "block",
        claim: "Five9",
        source: "resume_generation",
        explanation: "x",
        sourceContext: null,
        recommendedAction: "y",
      },
    ];

    const aggregated = aggregateVerificationIssues(issues);
    expect(aggregated.primary).toHaveLength(1);
    expect(aggregated.primary[0]?.claim).toBe("Five9");
    expect(aggregated.grouped.some((group) => group.label.includes("Additional verification limitations"))).toBe(true);
  });

  it("uses natural issue wording for platform and role requirement gaps", () => {
    const readiness = combineGenerationReadinessFromServer(
      {
        status: "blocked",
        reasons: [{ code: "full_block", message: "blocked" }],
        compliance_flags: [
          {
            code: "fictional_technology",
            severity: "block",
            message: 'Unsupported claim "Salesforce".',
            evidence: [{ generated: "Salesforce" }],
          },
          {
            code: "missing_baseline_support",
            severity: "warn",
            message: "Missing support",
            evidence: [{ generated: "customer escalations process" }],
          },
        ],
      },
      { status: "ready", reasons: [], compliance_flags: [] },
    );
    const explanations = readiness.verificationIssues.map((issue) => issue.explanation).join(" ");
    expect(explanations).not.toContain("technology/platform claim");
    expect(explanations).toContain("platform requirement");
    expect(explanations).toContain("role requirement");
  });

  it("uses typed issue wording for platform vs role requirements", () => {
    const readiness = combineGenerationReadinessFromServer(
      {
        status: "blocked",
        reasons: [{ code: "full_block", message: "blocked" }],
        compliance_flags: [
          {
            code: "fictional_technology",
            severity: "block",
            message: 'Unsupported claim "Salesforce".',
            evidence: [{ generated: "Salesforce", generatedClaim: { text: "Salesforce", type: "technology" } }],
          },
          {
            code: "missing_baseline_support",
            severity: "warn",
            message: 'Missing support for "self-service".',
            evidence: [{ generated: "self-service", baseline: "support deflection workflow" }],
          },
        ],
      },
      { status: "ready", reasons: [], compliance_flags: [] },
    );
    const platformIssue = readiness.verificationIssues.find((issue) => issue.claim === "Salesforce");
    const roleIssue = readiness.verificationIssues.find((issue) => issue.claim === "Self-service support");
    expect(platformIssue?.explanation).toContain("platform requirement");
    expect(roleIssue?.explanation).toContain("role requirement");
    expect((platformIssue?.explanation ?? "") + (roleIssue?.explanation ?? "")).not.toContain(
      "technology/platform claim",
    );
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
