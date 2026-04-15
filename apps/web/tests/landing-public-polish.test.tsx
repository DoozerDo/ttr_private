import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";

import { LandingPage } from "@/src/components/landing/LandingPage";
import { mockRouterPush, setFetchImplementation } from "@/tests/setup";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    headers: { get: () => "application/json" },
  };
}

describe("Public landing polish", () => {
  it("uses public CTA label, hides debug by default, and shows user-facing fit label", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/preview/extract-resume-text")) {
        return createResponse({ resumeText: "Resume text" }, true, 200);
      }
      if (url.includes("/api/preview/canonical-fit-score")) {
        return createResponse({ score: 82, scoreBand: "MID" }, true, 200);
      }
      return createResponse({});
    });
    setFetchImplementation(fetchMock);

    render(<LandingPage isAuthenticated={false} />);

    await screen.findByTestId("landing-analysis-block");

    expect(screen.getByTestId("landing-primary-action")).toHaveTextContent("Get your fit score");
    expect(screen.queryByText(/Check fit DEBUG/i)).toBeNull();
    expect(screen.queryByText(/CHECKFIT_DEBUG_/i)).toBeNull();
    expect(screen.queryByTestId("landing-gated-insights")).toBeNull();
    expect(screen.queryByTestId("landing-personalization-hook")).toBeNull();

    const resumeInput = screen.getByTestId("landing-resume-input");
    fireEvent.change(resumeInput, {
      target: { files: [new File(["Resume"], "resume.pdf", { type: "application/pdf" })] },
    });

    const jdInput = screen.getByTestId("landing-job-description-input");
    fireEvent.change(jdInput, { target: { value: "A".repeat(180) } });

    await waitFor(() => {
      expect(screen.getByTestId("landing-flow-state")).toHaveTextContent("input_ready");
    });

    fireEvent.click(screen.getByTestId("landing-primary-action"));

    await waitFor(() => {
      expect(screen.getByTestId("landing-preview-score")).toBeInTheDocument();
    });

    const scoreCard = within(screen.getByTestId("landing-preview-score"));
    expect(scoreCard.getByText("Fit score")).toBeInTheDocument();
    expect(scoreCard.getByText("Moderate fit")).toBeInTheDocument();
    expect(screen.queryByText(/\(MID\)/)).toBeNull();

    await waitFor(() => {
      expect(screen.getByTestId("landing-tension-bridge")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId("landing-personalization-hook")).toBeInTheDocument();
    });
    expect(screen.getByTestId("landing-gated-insights")).toBeInTheDocument();
    expect(screen.getByTestId("landing-partial-indicator")).toBeInTheDocument();
    expect(screen.getByTestId("landing-primary-action")).toHaveTextContent("Show me what’s missing");
    expect(screen.queryByText(/Unlock full analysis/i)).toBeNull();
    expect(screen.getByText("Missing signals hiring managers look for")).toBeInTheDocument();
    expect(screen.getByText("Where your experience doesn’t match the role")).toBeInTheDocument();
    expect(screen.getByText("Why you might be filtered out")).toBeInTheDocument();
    expect(screen.getByTestId("landing-primary-action-subline")).toHaveTextContent("See exactly what’s holding you back");

    const scoreEl = screen.getByTestId("landing-preview-score");
    const personalizationEl = screen.getByTestId("landing-personalization-hook");
    const tensionEl = screen.getByTestId("landing-tension-bridge");
    const gateEl = screen.getByTestId("landing-gated-insights");
    const inputsEl = screen.getByTestId("landing-inputs");
    expect(scoreEl.compareDocumentPosition(personalizationEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(personalizationEl.compareDocumentPosition(tensionEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(scoreEl.compareDocumentPosition(tensionEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tensionEl.compareDocumentPosition(gateEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(gateEl.compareDocumentPosition(screen.getByTestId("landing-primary-action")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(scoreEl.compareDocumentPosition(inputsEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByTestId("landing-primary-action").length).toBe(1);

    fireEvent.click(screen.getByTestId("landing-primary-action"));
    expect(mockRouterPush).toHaveBeenCalledWith("/auth/signup?next=%2Fbaseline");
  });
});
