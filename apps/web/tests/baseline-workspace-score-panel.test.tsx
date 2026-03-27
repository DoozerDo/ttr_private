import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { BaselineWorkspace } from "@/app/(app)/baseline/BaselineWorkspace";
import { overrideSearchParams, setFetchImplementation } from "./setup";

vi.mock("@/src/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("@/app/(app)/baseline/baseline-dashboard", () => ({
  BaselineDashboard: () => <div>Baseline Dashboard Mock</div>,
}));

vi.mock("@/app/(app)/baseline/_components/JobsHub", () => ({
  JobsHub: () => <div>Jobs Hub Mock</div>,
}));

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  const stringBody =
    typeof body === "string"
      ? body
      : body === undefined
        ? ""
        : JSON.stringify(body);

  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
  };
}

describe("BaselineWorkspace live score panel", () => {
  function stubWindowState() {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
    });

    overrideSearchParams({ baselineId: "base-1", jobId: "job-1" });
  }

  function blockAutoRunTimer() {
    const originalSetTimeout = window.setTimeout.bind(window);
    return vi
      .spyOn(window, "setTimeout")
      .mockImplementation(((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
        if (timeout === 320) {
          return 0 as unknown as number;
        }

        return originalSetTimeout(handler, timeout, ...(args as []));
      }) as typeof window.setTimeout);
  }

  it("renders the redesigned score panel on the active Baseline page path", async () => {
    stubWindowState();
    const setTimeoutSpy = blockAutoRunTimer();

    try {
      setFetchImplementation(
        vi.fn((input: RequestInfo) => {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : "url" in input
                  ? input.url
                  : String(input);

          if (url.includes("/api/analysis/") && url.includes("/latest")) {
            return Promise.resolve(
              createResponse({
                assessmentId: "assessment-1",
                baselineId: "base-1",
                jobId: "job-1",
                score: 87,
                strengths: [
                  "At microsoft, our mission—to empower every person and every organization",
                  "Led global support operations at SentinelOne.",
                  "Strong cross-functional influencing and collaboration skills that include fostering buy-in across multiple stakeholder groups.",
                  "Built escalation and incident management workflows.",
                ],
                criticalGaps: [
                  {
                    title: "At microsoft, our mission—to empower every person and every organization",
                    requirementEvidence: "Mission statement",
                    baselineEvidence: null,
                    severityScore: 0.95,
                  },
                  {
                    title: "Rust rtos’s and toolchains",
                    requirementEvidence: "Firmware engineering leadership",
                    baselineEvidence: null,
                    severityScore: 0.88,
                  },
                ],
              }),
            );
          }

          if (url.includes("/api/analysis/run")) {
            return Promise.resolve(
              createResponse({
                assessmentId: "assessment-1",
                baselineId: "base-1",
                jobId: "job-1",
                score: 87,
                strengths: [
                  "At microsoft, our mission—to empower every person and every organization",
                  "Led global support operations at SentinelOne.",
                  "Strong cross-functional influencing and collaboration skills that include fostering buy-in across multiple stakeholder groups.",
                  "Built escalation and incident management workflows.",
                ],
                criticalGaps: [
                  {
                    title: "At microsoft, our mission—to empower every person and every organization",
                    requirementEvidence: "Mission statement",
                    baselineEvidence: null,
                    severityScore: 0.95,
                  },
                  {
                    title: "Rust rtos’s and toolchains",
                    requirementEvidence: "Firmware engineering leadership",
                    baselineEvidence: null,
                    severityScore: 0.88,
                  },
                ],
              }),
            );
          }

          return Promise.resolve(createResponse({}));
        }),
      );

      render(
        <BaselineWorkspace
          initialBaselines={[
            {
              id: "base-1",
              originalFilename: "resume.pdf",
              version: 1,
            } as never,
          ]}
          initialFetchError={null}
          initialBaselineId="base-1"
          initialJobId="job-1"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Load last run" }));

      await waitFor(() => {
        expect(screen.getByText("Strong Match")).toBeInTheDocument();
      });

      expect(screen.getByText("Strong alignment with this role.")).toBeInTheDocument();
      expect(screen.getByText(/Led global support operations at sentinelone/i)).toBeInTheDocument();
      expect(screen.getByText("Why this is a strong match")).toBeInTheDocument();
      expect(screen.getByText("Ready to generate tailored materials now.")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Open Studio" }),
      ).toHaveAttribute("href", "/studio?analysisId=assessment-1&jobId=job-1&baselineId=base-1");
      expect(screen.getByRole("link", { name: "View detailed analysis" })).toHaveAttribute(
        "href",
        "/results?assessmentId=assessment-1",
      );
      expect(screen.queryByRole("button", { name: "Add to Opportunities" })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Run Career Compatibility Analysis" }),
      ).toBeNull();
      expect(screen.queryByText("BASELINE READY")).toBeNull();
      expect(screen.queryByText("Why this score?")).toBeNull();
      expect(screen.queryByText("Evidence from your background")).toBeNull();
      expect(screen.queryByText("Tooling and Platform Experience")).toBeNull();
      expect(screen.queryByText("Where the gaps are")).toBeNull();
      expect(screen.queryByText("Areas outside your background")).toBeNull();
      expect(screen.queryByText("Major gap")).toBeNull();
      expect(screen.queryByText(/Rust RTOS and toolchains/i)).toBeNull();
      expect(screen.queryByText(/our mission/i)).toBeNull();
      expect(screen.queryByText(/Strong cross-functional influencing/i)).toBeNull();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("shows a fallback strength when the score is high and explicit strengths are empty", async () => {
    stubWindowState();
    const setTimeoutSpy = blockAutoRunTimer();

    try {
      setFetchImplementation(
        vi.fn((input: RequestInfo) => {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : "url" in input
                  ? input.url
                  : String(input);

          if (url.includes("/api/analysis/") && url.includes("/latest")) {
            return Promise.resolve(
              createResponse({
                assessmentId: "assessment-2",
                baselineId: "base-1",
                jobId: "job-1",
                score: 82,
                strengths: [],
                criticalGaps: [
                  {
                    title: "Experience with embedded Rust and RTOS toolchains",
                    requirementEvidence: "Embedded Rust and RTOS toolchains",
                    baselineEvidence: "Partnered with engineering teams to operate complex systems.",
                    severityScore: 0.42,
                  },
                ],
              }),
            );
          }

          if (url.includes("/api/analysis/run")) {
            return Promise.resolve(createResponse({}));
          }

          return Promise.resolve(createResponse({}));
        }),
      );

      render(
        <BaselineWorkspace
          initialBaselines={[
            {
              id: "base-1",
              originalFilename: "resume.pdf",
              version: 1,
            } as never,
          ]}
          initialFetchError={null}
          initialBaselineId="base-1"
          initialJobId="job-1"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Load last run" }));

      await waitFor(() => {
        expect(screen.getByText("Strong Match")).toBeInTheDocument();
      });

      expect(screen.getByText("Why this is a strong match")).toBeInTheDocument();
      expect(
        screen.getByText(/Partnered with engineering teams to operate complex systems/i),
      ).toBeInTheDocument();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("blocks generation CTA when score is high but readiness is blocked", async () => {
    stubWindowState();
    const setTimeoutSpy = blockAutoRunTimer();

    try {
      setFetchImplementation(
        vi.fn((input: RequestInfo) => {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : "url" in input
                  ? input.url
                  : String(input);

          if (url.includes("/api/analysis/") && url.includes("/latest")) {
            return Promise.resolve(
              createResponse({
                assessmentId: "assessment-3",
                baselineId: "base-1",
                jobId: "job-1",
                score: 94,
                strengths: ["Led global support operations with measurable outcomes."],
                complianceFlags: [
                  {
                    code: "missing_baseline_support",
                    severity: "block",
                    message: "Missing baseline support for critical role claim.",
                  },
                ],
              }),
            );
          }

          return Promise.resolve(createResponse({}));
        }),
      );

      render(
        <BaselineWorkspace
          initialBaselines={[
            {
              id: "base-1",
              originalFilename: "resume.pdf",
              version: 1,
            } as never,
          ]}
          initialFetchError={null}
          initialBaselineId="base-1"
          initialJobId="job-1"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Load last run" }));

      await waitFor(() => {
      expect(screen.getByText("Primary readiness")).toBeInTheDocument();
      });

      expect(screen.getByText("Strong match, but not ready to generate")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Your experience aligns with this role. But your baseline does not yet support compliant document generation.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Resolve gaps before generating" })).toBeDisabled();
      expect(screen.getByRole("link", { name: "Fix baseline and continue" })).toHaveAttribute(
        "href",
        "/results?assessmentId=assessment-3",
      );
      expect(screen.queryByRole("link", { name: "Generate Tailored Materials" })).toBeNull();
      expect(
        screen.getByText("You are a strong match, but your materials need refinement before applying."),
      ).toBeInTheDocument();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("keeps generation CTA behavior unchanged for scores at or below 70", async () => {
    stubWindowState();
    const setTimeoutSpy = blockAutoRunTimer();

    try {
      setFetchImplementation(
        vi.fn((input: RequestInfo) => {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : "url" in input
                  ? input.url
                  : String(input);

          if (url.includes("/api/analysis/") && url.includes("/latest")) {
            return Promise.resolve(
              createResponse({
                assessmentId: "assessment-4",
                baselineId: "base-1",
                jobId: "job-1",
                score: 69,
                strengths: ["Worked across support workflows."],
                complianceFlags: [
                  {
                    code: "missing_baseline_support",
                    severity: "block",
                    message: "Missing baseline support for critical role claim.",
                  },
                ],
              }),
            );
          }

          return Promise.resolve(createResponse({}));
        }),
      );

      render(
        <BaselineWorkspace
          initialBaselines={[
            {
              id: "base-1",
              originalFilename: "resume.pdf",
              version: 1,
            } as never,
          ]}
          initialFetchError={null}
          initialBaselineId="base-1"
          initialJobId="job-1"
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Load last run" }));

      await waitFor(() => {
        expect(screen.getByRole("link", { name: "Continue Building Baseline" })).toBeInTheDocument();
      });

      expect(screen.getByRole("link", { name: "Continue Building Baseline" })).toHaveAttribute(
        "href",
        "/results?assessmentId=assessment-4",
      );
      expect(screen.queryByText("Strong match, but not ready to generate")).toBeNull();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("keeps the target workspace horizontal on desktop with a wider baseline column", () => {
    stubWindowState();

    render(
      <BaselineWorkspace
        initialBaselines={[
          {
            id: "base-1",
            originalFilename: "resume.pdf",
            version: 1,
          } as never,
        ]}
        initialFetchError={null}
        initialBaselineId="base-1"
        initialJobId="job-1"
      />,
    );

    expect(screen.getByTestId("target-workspace-layout")).toHaveClass(
      "xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1.35fr)_minmax(280px,1fr)]",
    );
    expect(screen.getByTestId("target-baseline-column")).toHaveClass("xl:min-w-0");
    expect(screen.getByTestId("target-job-column")).toHaveClass("xl:min-w-0");
    expect(screen.getByTestId("target-result-column")).toHaveClass("xl:min-w-0");
    expect(screen.getByText("Baseline")).toBeInTheDocument();
    expect(screen.getByText("Baseline Dashboard Mock")).toBeInTheDocument();
    expect(screen.getByText("Job description")).toBeInTheDocument();
    expect(screen.getByText("Jobs Hub Mock")).toBeInTheDocument();
    expect(screen.getByText("Compatibility result")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your baseline defines the experience signals used for compatibility scoring and resume generation.",
      ),
    ).toBeInTheDocument();
  });

  it("does not render completed score when canonical assessmentId is missing", async () => {
    stubWindowState();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    try {
      setFetchImplementation(
        vi.fn((input: RequestInfo) => {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : "url" in input
                  ? input.url
                  : String(input);

          if (url.includes("/api/analysis/run")) {
            return Promise.resolve(
              createResponse({
                baselineId: "base-1",
                jobId: "job-1",
                score: 88,
              }),
            );
          }

          if (url.includes("/api/analysis/") && url.includes("/latest")) {
            return Promise.resolve(createResponse({}, false, 404));
          }

          return Promise.resolve(createResponse({}));
        }),
      );

      render(
        <BaselineWorkspace
          initialBaselines={[
            {
              id: "base-1",
              originalFilename: "resume.pdf",
              version: 1,
            } as never,
          ]}
          initialFetchError={null}
          initialBaselineId="base-1"
          initialJobId="job-1"
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText("Analysis did not complete successfully. No persisted assessment was created."),
        ).toBeInTheDocument();
      });

      expect(screen.queryByText("Compatibility Score")).toBeNull();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});
