import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { BetaFeedbackCapture } from "@/app/(app)/components/BetaFeedbackCapture";
import {
  mockPathname,
  overrideSearchParams,
  setFetchImplementation,
} from "@/tests/setup";

describe("BetaFeedbackCapture", () => {
  it("submits feedback with category and contextual ids", async () => {
    mockPathname.mockReturnValue("/results");
    overrideSearchParams({ analysisId: "a1", baselineId: "b1", opportunityId: "o1" });
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    setFetchImplementation(fetchMock as unknown as typeof fetch);

    render(<BetaFeedbackCapture />);

    fireEvent.click(screen.getByRole("button", { name: "Report Beta Feedback" }));
    fireEvent.change(screen.getByPlaceholderText("Short title"), { target: { value: "Broken output" } });
    fireEvent.change(screen.getByPlaceholderText("What happened and what you expected"), { target: { value: "Bad formatting" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(body.category).toBe("bug");
    expect(body.analysisId).toBe("a1");
    expect(body.baselineId).toBe("b1");
    expect(body.opportunityId).toBe("o1");
    expect(body.pageContext).toBe("/results");
  });

  it("does not render outside supported pages", () => {
    mockPathname.mockReturnValue("/beta");
    render(<BetaFeedbackCapture />);
    expect(screen.queryByRole("button", { name: "Report Beta Feedback" })).not.toBeInTheDocument();
  });
});

