import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("Landing post-score routing", () => {
  it("routes authenticated users to /baseline after score reveal", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/preview/extract-resume-text")) {
        return createResponse({ resumeText: "Resume text" }, true, 200);
      }
      if (url.includes("/api/preview/canonical-fit-score")) {
        return createResponse({ score: 91, scoreBand: "TOP" }, true, 200);
      }
      return createResponse({});
    });
    setFetchImplementation(fetchMock);

    render(<LandingPage isAuthenticated={true} />);

    const resumeInput = await screen.findByTestId("landing-resume-input");
    fireEvent.change(resumeInput, {
      target: { files: [new File(["Resume"], "resume.pdf", { type: "application/pdf" })] },
    });
    fireEvent.change(screen.getByTestId("landing-job-description-input"), { target: { value: "A".repeat(200) } });

    await waitFor(() => {
      expect(screen.getByTestId("landing-flow-state")).toHaveTextContent("input_ready");
    });

    fireEvent.click(screen.getByTestId("landing-primary-action"));

    await waitFor(() => {
      expect(screen.getByTestId("landing-primary-action")).toHaveTextContent("Show me what’s missing");
    });

    fireEvent.click(screen.getByTestId("landing-primary-action"));
    expect(mockRouterPush).toHaveBeenCalledWith("/baseline");
  });
});

