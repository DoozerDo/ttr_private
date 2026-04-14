import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { ReportBugModal } from "@/src/components/support/ReportBugModal";
import { getGenerationCompletionStorageKey } from "@/lib/nextAction";
import { mockPathname, overrideSearchParams, setFetchImplementation } from "@/tests/setup";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  };
}

function installSupportFetch(overrides?: {
  config?: Response | ReturnType<typeof createResponse>;
  reportBug?: Response | ReturnType<typeof createResponse>;
}) {
  const configResponse = overrides?.config ?? createResponse({ githubConfigured: true });
  const reportResponse =
    overrides?.reportBug ?? createResponse({ status: "submission_success", message: "Thanks. Your report was submitted successfully.", reportId: "bug-123" });

  setFetchImplementation(async (input: RequestInfo) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (url.includes("/api/support/config")) {
      return configResponse as Response;
    }
    if (url.includes("/api/support/report-bug")) {
      return reportResponse as Response;
    }
    return createResponse({});
  });
}

describe("ReportBugModal", () => {
  it("preflights support config before enabling submit", async () => {
    installSupportFetch();
    render(<ReportBugModal open onClose={() => {}} />);

    const button = screen.getByRole("button", { name: /send issue report/i });
    expect(button).toBeDisabled();
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it("shows success message after successful submit", async () => {
    installSupportFetch();

    render(<ReportBugModal open onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /send issue report/i })).not.toBeDisabled();
    });

    fireEvent.change(screen.getByPlaceholderText("What went wrong?"), {
      target: { value: "Results page crashes on load with error" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send issue report/i }));

    await waitFor(() => {
      expect(screen.getByText("Thanks. Your report was submitted successfully.")).toBeInTheDocument();
    });
  });

  it("shows an explicit disabled state when bug reporting is not configured", async () => {
    installSupportFetch({
      config: createResponse({ githubConfigured: false }),
    });

    render(<ReportBugModal open onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Bug reporting is disabled in this environment. Save a draft and check Support history later.",
      );
    });
    expect(screen.getByRole("button", { name: /send issue report/i })).toBeDisabled();
    expect(screen.getByRole("link", { name: /support history/i })).toHaveAttribute("href", "/support/history");
  });

  it("shows a retryable error when submission fails", async () => {
    const stored: Record<string, string> = {};
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => stored[key] ?? null,
        setItem: (key: string, value: string) => {
          stored[key] = value;
        },
        removeItem: (key: string) => {
          delete stored[key];
        },
      },
    });
    installSupportFetch({
      reportBug: createResponse(
        {
          status: "submission_failed",
          code: "bug_report_failed",
          message: "Bug report failed to send",
          supportPath: "/support/history",
        },
        false,
        503,
      ),
    });

    render(<ReportBugModal open onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /send issue report/i })).not.toBeDisabled();
    });

    fireEvent.change(screen.getByPlaceholderText("What went wrong?"), {
      target: { value: "Saving baseline failed unexpectedly" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send issue report/i }));

    await waitFor(() => {
      expect(screen.getByText("Bug report failed to send")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /support history/i })).toHaveAttribute("href", "/support/history");
    expect(stored["ttr.support.bug-report.draft.v1"]).toContain("Saving baseline failed unexpectedly");
  });

  it("shows service unavailable when the config request cannot reach the backend", async () => {
    installSupportFetch({
      config: createResponse(
        {
          status: "service_unavailable",
          code: "UPSTREAM_API_URL_MISSING",
          message: "Support service is unavailable right now. You can keep working and try again later.",
        },
        false,
        503,
      ),
    });

    render(<ReportBugModal open onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Support service is unavailable right now. You can keep working and try again later.",
      );
    });
    expect(screen.getByRole("button", { name: /send issue report/i })).toBeDisabled();
  });

  it("sends the message field expected by the backend", async () => {
    let payload: Record<string, unknown> | null = null;
    installSupportFetch();
    setFetchImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/support/config")) {
        return createResponse({ githubConfigured: true });
      }
      if (url.includes("/api/support/report-bug")) {
        payload = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
        return createResponse({ status: "submission_success", message: "Thanks. Your report was submitted successfully.", reportId: "bug-789" });
      }
      return createResponse({});
    });

    render(<ReportBugModal open onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /send issue report/i })).not.toBeDisabled();
    });

    fireEvent.change(screen.getByPlaceholderText("What went wrong?"), {
      target: { value: "Valid bug report message" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send issue report/i }));

    await waitFor(() => {
      expect(screen.getByText("Thanks. Your report was submitted successfully.")).toBeInTheDocument();
    });

    expect(payload).toMatchObject({
      message: "Valid bug report message",
    });
    expect(payload).not.toHaveProperty("description");
  });

  it("does not submit an empty message", async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/support/config")) {
        return createResponse({ githubConfigured: true });
      }
      if (url.includes("/api/support/report-bug")) {
        return createResponse({ ok: true, reportId: "bug-000" });
      }
      return createResponse({});
    });
    setFetchImplementation(fetchSpy as unknown as typeof fetch);

    render(<ReportBugModal open onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /send issue report/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /send issue report/i }));

    expect(
      fetchSpy.mock.calls.some(([input]) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        return url.includes("/api/support/report-bug");
      }),
    ).toBe(false);
  });

  it("does not submit a short message", async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/support/config")) {
        return createResponse({ githubConfigured: true });
      }
      if (url.includes("/api/support/report-bug")) {
        return createResponse({ ok: true, reportId: "bug-001" });
      }
      return createResponse({});
    });
    setFetchImplementation(fetchSpy as unknown as typeof fetch);

    render(<ReportBugModal open onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /send issue report/i })).not.toBeDisabled();
    });
    fireEvent.change(screen.getByPlaceholderText("What went wrong?"), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send issue report/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Please enter a message between 10 and 4000 characters.").length).toBeGreaterThan(0);
    });
    expect(
      fetchSpy.mock.calls.some(([input]) => {
        const url = typeof input === "string" ? input : input?.url ?? "";
        return url.includes("/api/support/report-bug");
      }),
    ).toBe(false);
  });

  it("submits issue context with route and user id", async () => {
    let payload: Record<string, unknown> | null = null;
    const generationKey = getGenerationCompletionStorageKey("job-1", "baseline-1");
    const stored: Record<string, string> = {};
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => stored[key] ?? null,
        setItem: (key: string, value: string) => {
          stored[key] = value;
        },
        clear: () => {
          Object.keys(stored).forEach((key) => delete stored[key]);
        },
      },
    });
    mockPathname.mockReturnValue("/results");
    window.history.pushState({}, "", "/results?baselineId=baseline-1&jobId=job-1&assessmentId=assessment-1");
    overrideSearchParams({
      baselineId: "baseline-1",
      jobId: "job-1",
      assessmentId: "assessment-1",
    });
    if (generationKey) {
      localStorage.setItem(generationKey, "true");
    }
    localStorage.setItem(
      "ttr.lastAnalysis.v1",
      JSON.stringify({
        savedAt: "2026-03-27T09:59:00.000Z",
        analysis: {
          score: 82,
          baselineId: "baseline-1",
          jobId: "job-1",
          assessmentId: "assessment-1",
        },
        baselineId: "baseline-1",
        jobId: "job-1",
        fitScore: 82,
        jobSource: { type: "saved" },
      }),
    );
    setFetchImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/support/config")) {
        return createResponse({ githubConfigured: true });
      }
      if (url.includes("/api/support/report-bug")) {
        payload = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
        return createResponse({ status: "submission_success", message: "Thanks. Your report was submitted successfully.", reportId: "bug-456" });
      }
      return createResponse({});
    });

    const originalDate = Date;
    class MockDate extends Date {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) {
          super("2026-03-27T10:00:00.000Z");
          return;
        }
        super(...args);
      }
      static override now() {
        return new originalDate("2026-03-27T10:00:00.000Z").getTime();
      }
    }
    // @ts-expect-error test override
    global.Date = MockDate;

    render(<ReportBugModal open onClose={() => {}} userId="user-123" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /send issue report/i })).not.toBeDisabled();
    });
    fireEvent.change(screen.getByPlaceholderText("What went wrong?"), {
      target: { value: "The header report button does not open on mobile." },
    });
    fireEvent.change(screen.getByPlaceholderText("Steps, expected result, what you saw"), {
      target: { value: "Opened Baseline, clicked the header button, nothing happened." },
    });
    fireEvent.click(screen.getByRole("button", { name: /send issue report/i }));

    await waitFor(() => {
      expect(screen.getByText("Thanks. Your report was submitted successfully.")).toBeInTheDocument();
    });

    expect(payload).toMatchObject({
      message: "The header report button does not open on mobile.",
      details: "Opened Baseline, clicked the header button, nothing happened.",
      route: "/results?baselineId=baseline-1&jobId=job-1&assessmentId=assessment-1",
      userId: "user-123",
      baselineId: "baseline-1",
      jobId: "job-1",
      assessmentId: "assessment-1",
      score: 82,
      timestamp: "2026-03-27T10:00:00.000Z",
      userAgent: expect.any(String),
    });

    global.Date = originalDate;
  });
});
