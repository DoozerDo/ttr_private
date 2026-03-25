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

    const button = screen.getByRole("button", { name: /send bug report/i });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Describe the problem"), {
      target: { value: "This is long enough text" },
    });
    expect(button).not.toBeDisabled();
  });

  it("shows success message after successful submit", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/bug-reports")) {
        return createResponse({ ok: true, reportId: "bug-123" });
      }
      return createResponse({});
    });

    render(<ReportBugModal open onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Describe the problem"), {
      target: { value: "Results page crashes on load with error" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send bug report/i }));

    await waitFor(() => {
      expect(screen.getByText("Thanks - your report was submitted successfully.")).toBeInTheDocument();
    });
  });

  it("shows error state when submit fails", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/bug-reports")) {
        return createResponse({ message: "Bug report failed to send. Please try again." }, false, 503);
      }
      return createResponse({});
    });

    render(<ReportBugModal open onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Describe the problem"), {
      target: { value: "Saving baseline failed unexpectedly" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send bug report/i }));

    await waitFor(() => {
      expect(screen.getByText("Bug report failed to send. Please try again.")).toBeInTheDocument();
    });
  });
});
