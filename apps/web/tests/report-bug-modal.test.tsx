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
  it("shows a reference when the backend returns an issue number", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/support/config")) {
        return createResponse({ githubConfigured: true });
      }
      if (url.includes("/api/support/report-bug")) {
        return createResponse({ issueNumber: 123 });
      }

      return createResponse({});
    });

    render(<ReportBugModal open onClose={() => {}} />);

    const messageField = screen.getByPlaceholderText("Tell us what went wrong");
    fireEvent.change(messageField, { target: { value: "App error" } });

    fireEvent.click(screen.getByRole("button", { name: /send bug report/i }));

    await waitFor(() => {
      expect(screen.getByText(/Reference: #123/)).toBeInTheDocument();
    });
  });

  it("disables submission when support config reports bug reporting unavailable", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/support/config")) {
        return createResponse({ githubConfigured: false });
      }
      return createResponse({});
    });

    render(<ReportBugModal open onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    });

    const button = screen.getByRole("button", { name: /bug reporting unavailable/i });
    expect(button).toBeDisabled();
  });
});
