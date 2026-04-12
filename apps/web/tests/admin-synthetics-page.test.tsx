import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SyntheticReliabilityPage from "../app/(app)/admin/synthetics/page";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("SyntheticReliabilityPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the landing/auth synthetic registry entry with empty history", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createResponse({
        generatedAt: "2026-04-12T10:00:00.000Z",
        suiteCount: 1,
        statusCounts: { pass: 0, fail: 0, running: 0, unknown: 1 },
        sources: { registry: "static-registry", latestRuns: "synthetic_cleanup_runs" },
        healthRollup: {
          status: "unknown",
          statusLabel: "Unknown",
          failingSuites: 0,
          failingSuiteNames: [],
          staleSuites: 0,
          staleSuiteNames: [],
          latestRunAt: null,
          latestRunAgeMinutes: null,
          recencyLabel: "No run history yet",
          staleThresholdMinutes: 15,
        },
        suites: [
          {
            suiteKey: "landing-public-journeys",
            suiteName: "Landing / Auth Synthetic",
            surface: "Public landing + auth",
            category: "Public conversion",
            journeySummary:
              "Landing render, resume upload, job description validation, beta signup, login, and post-login continuity.",
            active: true,
            validatedJourneys: ["Landing page renders with hero, analysis block, trust strip, and radar teaser"],
            dependencies: ["Public landing route", "Resume upload endpoint"],
            envInputs: ["BASE_URL", "API_BASE_URL"],
            sourceRefs: ["apps/web/tests/synthetic/landing-journeys.spec.ts"],
            artifactRefs: ["apps/web/tests/fixtures/public-landing/synthetic-resume.pdf"],
            latestRun: null,
            recentHistory: [],
            provenance: {
              registrySource: "static-registry",
              latestRunSource: "none",
              historySource: "none",
            },
          },
        ],
      }),
    );

    render(<SyntheticReliabilityPage />);

    await waitFor(() => expect(screen.getByText("Landing / Auth Synthetic")).toBeInTheDocument());
    expect(
      screen.getByText("No run history recorded yet. When a synthetic report is published, the latest run will show here."),
    ).toBeInTheDocument();
    expect(screen.getByText("Landing page renders with hero, analysis block, trust strip, and radar teaser")).toBeInTheDocument();
    expect(screen.getByText("apps/web/tests/synthetic/landing-journeys.spec.ts")).toBeInTheDocument();
  });

  it("renders fail state details when the latest run failed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createResponse({
        generatedAt: "2026-04-12T10:00:00.000Z",
        suiteCount: 1,
        statusCounts: { pass: 0, fail: 1, running: 0, unknown: 0 },
        sources: { registry: "static-registry", latestRuns: "synthetic_cleanup_runs" },
        healthRollup: {
          status: "failing",
          statusLabel: "Failing",
          failingSuites: 1,
          failingSuiteNames: ["Landing / Auth Synthetic"],
          staleSuites: 0,
          staleSuiteNames: [],
          latestRunAt: "2026-04-12T10:00:00.000Z",
          latestRunAgeMinutes: 0,
          recencyLabel: "last run just now",
          staleThresholdMinutes: 15,
        },
        suites: [
          {
            suiteKey: "landing-public-journeys",
            suiteName: "Landing / Auth Synthetic",
            surface: "Public landing + auth",
            category: "Public conversion",
            journeySummary: "Landing render, resume upload, beta signup, login, and post-login continuity.",
            active: true,
            validatedJourneys: ["Landing page renders with hero, analysis block, trust strip, and radar teaser"],
            dependencies: ["Public landing route", "Auth session cookie"],
            envInputs: ["BASE_URL", "API_BASE_URL"],
            sourceRefs: ["apps/web/tests/synthetic/landing-journeys.spec.ts"],
            artifactRefs: [],
            latestRun: {
              id: "run-2",
              status: "fail",
              startedAt: "2026-04-12T10:00:00.000Z",
              finishedAt: "2026-04-12T10:02:00.000Z",
              durationMs: 120000,
              summary: "Login flow broke at the auth handoff",
              errorMessage: "Auth redirect mismatch",
              failureReason: "Auth redirect mismatch",
              firstFailureStep: {
                key: "login.continuity",
                title: "Login routes through the intended authenticated handoff",
                status: "failed",
                errorMessage: "Auth redirect mismatch",
              },
              ageMinutes: 0,
              isStale: false,
              rawStatus: "failed",
              stepCount: 6,
            },
            recentHistory: [
              {
                id: "run-2",
                status: "fail",
                startedAt: "2026-04-12T10:00:00.000Z",
                finishedAt: "2026-04-12T10:02:00.000Z",
                durationMs: 120000,
                summary: "Login flow broke at the auth handoff",
                errorMessage: "Auth redirect mismatch",
                failureReason: "Auth redirect mismatch",
                firstFailureStep: {
                  key: "login.continuity",
                  title: "Login routes through the intended authenticated handoff",
                  status: "failed",
                  errorMessage: "Auth redirect mismatch",
                },
                ageMinutes: 0,
                isStale: false,
                rawStatus: "failed",
                stepCount: 6,
              },
            ],
            provenance: {
              registrySource: "static-registry",
              latestRunSource: "database",
              historySource: "database",
            },
          },
        ],
      }),
    );

    render(<SyntheticReliabilityPage />);

    await waitFor(() => {
      const article = screen.getByText("Landing / Auth Synthetic").closest("article");
      expect(article).not.toBeNull();
      expect(article).toHaveTextContent("Auth redirect mismatch");
    });
    const suiteCard = screen.getByText("Landing / Auth Synthetic").closest("article");
    expect(suiteCard).not.toBeNull();
    expect(suiteCard).toHaveTextContent("Fail");
    expect(suiteCard).toHaveTextContent("Login flow broke at the auth handoff");
    expect(suiteCard).toHaveTextContent("Failure reason");
    expect(suiteCard).toHaveTextContent("Login routes through the intended authenticated handoff");
    expect(suiteCard).toHaveTextContent("Duration:");
  });

  it("renders stale status when the latest run is too old", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createResponse({
        generatedAt: "2026-04-12T10:00:00.000Z",
        suiteCount: 1,
        statusCounts: { pass: 1, fail: 0, running: 0, unknown: 0 },
        sources: { registry: "static-registry", latestRuns: "synthetic_cleanup_runs" },
        healthRollup: {
          status: "stale",
          statusLabel: "Stale",
          failingSuites: 0,
          failingSuiteNames: [],
          staleSuites: 1,
          staleSuiteNames: ["Landing / Auth Synthetic"],
          latestRunAt: "2026-04-12T09:30:00.000Z",
          latestRunAgeMinutes: 30,
          recencyLabel: "stale",
          staleThresholdMinutes: 15,
        },
        suites: [
          {
            suiteKey: "landing-public-journeys",
            suiteName: "Landing / Auth Synthetic",
            surface: "Public landing + auth",
            category: "Public conversion",
            journeySummary: "Landing render, resume upload, beta signup, login, and post-login continuity.",
            active: true,
            validatedJourneys: ["Landing page renders with hero, analysis block, trust strip, and radar teaser"],
            dependencies: ["Public landing route", "Auth session cookie"],
            envInputs: ["BASE_URL", "API_BASE_URL"],
            sourceRefs: ["apps/web/tests/synthetic/landing-journeys.spec.ts"],
            artifactRefs: [],
            latestRun: {
              id: "run-1",
              status: "pass",
              startedAt: "2026-04-12T09:30:00.000Z",
              finishedAt: "2026-04-12T09:31:00.000Z",
              durationMs: 60000,
              summary: "Landing/auth synthetic passed",
              errorMessage: null,
              failureReason: null,
              firstFailureStep: null,
              ageMinutes: 30,
              isStale: true,
              rawStatus: "succeeded",
              stepCount: 6,
            },
            recentHistory: [],
            provenance: {
              registrySource: "static-registry",
              latestRunSource: "database",
              historySource: "database",
            },
          },
        ],
      }),
    );

    render(<SyntheticReliabilityPage />);

    await waitFor(() => {
      const article = screen.getByText("Landing / Auth Synthetic").closest("article");
      expect(article).not.toBeNull();
      expect(article).toHaveTextContent("Stale");
    });
  });

  it("renders the password reset synthetic suite in the registry", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createResponse({
        generatedAt: "2026-04-12T10:00:00.000Z",
        suiteCount: 2,
        statusCounts: { pass: 1, fail: 1, running: 0, unknown: 0 },
        sources: { registry: "static-registry", latestRuns: "synthetic_cleanup_runs" },
        healthRollup: {
          status: "failing",
          statusLabel: "Failing",
          failingSuites: 1,
          failingSuiteNames: ["Password Reset Synthetic"],
          staleSuites: 0,
          staleSuiteNames: [],
          latestRunAt: "2026-04-12T10:00:00.000Z",
          latestRunAgeMinutes: 0,
          recencyLabel: "last run just now",
          staleThresholdMinutes: 15,
          lastSuccessfulPublishAt: "2026-04-12T10:00:00.000Z",
          lastAttemptedPublishAt: "2026-04-12T10:00:00.000Z",
        },
        suites: [
          {
            suiteKey: "landing-public-journeys",
            suiteName: "Landing / Auth Synthetic",
            surface: "Public landing + auth",
            category: "Public conversion",
            journeySummary:
              "Landing render, resume upload, job description validation, beta signup, login, and post-login continuity.",
            active: true,
            validatedJourneys: ["Landing page renders with hero, analysis block, trust strip, and radar teaser"],
            dependencies: ["Public landing route", "Resume upload endpoint"],
            envInputs: ["BASE_URL", "API_BASE_URL"],
            sourceRefs: ["apps/web/tests/synthetic/landing-journeys.spec.ts"],
            artifactRefs: ["apps/web/tests/fixtures/public-landing/synthetic-resume.pdf"],
            latestRun: {
              id: "run-1",
              status: "pass",
              startedAt: "2026-04-12T10:00:00.000Z",
              finishedAt: "2026-04-12T10:01:00.000Z",
              durationMs: 60000,
              summary: "Landing/auth synthetic passed",
              errorMessage: null,
              failureReason: null,
              firstFailureStep: null,
              ageMinutes: 0,
              isStale: false,
              rawStatus: "succeeded",
              stepCount: 6,
            },
            recentHistory: [],
            provenance: {
              registrySource: "static-registry",
              latestRunSource: "database",
              historySource: "database",
            },
          },
          {
            suiteKey: "password-reset-public-journeys",
            suiteName: "Password Reset Synthetic",
            surface: "Public auth + recovery",
            category: "Authentication recovery",
            journeySummary:
              "Reset request initiation, reset link retrieval, password replacement, login with the new password, old password rejection, and reset-link reuse rejection.",
            active: true,
            validatedJourneys: [
              "Reset request is accepted",
              "Reset link is retrievable from the synthetic token store",
              "Reset link opens and accepts a new password",
            ],
            dependencies: ["Public login route", "Forgot password flow", "Reset password flow"],
            envInputs: [
              "BASE_URL",
              "API_BASE_URL",
              "SYNTHETIC_PASSWORD_RESET_EMAIL",
              "SYNTHETIC_PASSWORD_RESET_NEW_PASSWORD",
            ],
            sourceRefs: ["apps/web/tests/synthetic/password-reset-journeys.spec.ts"],
            artifactRefs: [],
            latestRun: {
              id: "run-2",
              status: "fail",
              startedAt: "2026-04-12T09:55:00.000Z",
              finishedAt: "2026-04-12T09:56:30.000Z",
              durationMs: 90000,
              summary: "Reset link retrieval failed",
              errorMessage: "No reset token found",
              failureReason: "No reset token found",
              firstFailureStep: {
                key: "reset.link",
                title: "Reset link is retrievable from the synthetic token store",
                status: "failed",
                errorMessage: "No reset token found",
              },
              ageMinutes: 5,
              isStale: false,
              rawStatus: "failed",
              stepCount: 6,
            },
            recentHistory: [],
            provenance: {
              registrySource: "static-registry",
              latestRunSource: "database",
              historySource: "database",
            },
          },
        ],
      }),
    );

    render(<SyntheticReliabilityPage />);

    await waitFor(() => expect(screen.getByText("Password Reset Synthetic")).toBeInTheDocument());
    expect(screen.getByText("Reset link is retrievable from the synthetic token store")).toBeInTheDocument();
    const suiteCard = screen.getByText("Password Reset Synthetic").closest("article");
    expect(suiteCard).not.toBeNull();
    expect(suiteCard).toHaveTextContent("No reset token found");
  });
});
