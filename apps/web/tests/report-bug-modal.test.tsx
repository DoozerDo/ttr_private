import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReportBugModal } from "@/src/components/support/ReportBugModal";
import { setFetchImplementation } from "@/tests/setup";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  };
}

describe("ReportBugModal", () => {
  it("submit button is disabled until required content is present", () => {
    setFetchImplementation(async () => createResponse({}));
    render(<ReportBugModal open onClose={() => {}} />);

    const button = screen.getByRole("button", { name: /send issue report/i });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("What went wrong?"), {
      target: { value: "This is long enough text" },
    });
    expect(button).not.toBeDisabled();
  });

  it("shows success message after successful submit", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/support/report-bug")) {
        return createResponse({ ok: true, reportId: "bug-123" });
      }
      return createResponse({});
    });

    render(<ReportBugModal open onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("What went wrong?"), {
      target: { value: "Results page crashes on load with error" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send issue report/i }));

    await waitFor(() => {
      expect(screen.getByText("Thanks. Your report was submitted successfully.")).toBeInTheDocument();
    });
  });

  it("shows error state when submit fails", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/support/report-bug")) {
        return createResponse({ message: "Bug report failed to send. Please try again." }, false, 503);
      }
      return createResponse({});
    });

    render(<ReportBugModal open onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("What went wrong?"), {
      target: { value: "Saving baseline failed unexpectedly" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send issue report/i }));

    await waitFor(() => {
      expect(screen.getByText("Bug report failed to send. Please try again.")).toBeInTheDocument();
    });
  });

  it("submits issue context with route and user id", async () => {
    let payload: Record<string, unknown> | null = null;
    setFetchImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/support/report-bug")) {
        payload = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
        return createResponse({ ok: true, reportId: "bug-456" });
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
      description: "The header report button does not open on mobile.",
      details: "Opened Baseline, clicked the header button, nothing happened.",
      route: "/",
      userId: "user-123",
      timestamp: "2026-03-27T10:00:00.000Z",
    });

    global.Date = originalDate;
  });
});

