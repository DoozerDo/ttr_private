import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { LandingPage } from "@/src/components/landing/LandingPage";
import { setFetchImplementation } from "@/tests/setup";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    headers: { get: () => "application/json" },
  };
}

describe("Anonymous landing upload flow", () => {
  it("does not attempt /api/users/me when landing is anonymous (401 tolerant)", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/users/me")) {
        return createResponse({ error: "Unauthorized" }, false, 401);
      }
      return createResponse({});
    });
    setFetchImplementation(fetchMock);

    render(<LandingPage isAuthenticated={false} />);

    await waitFor(() => {
      expect(screen.getByTestId("landing-analysis-block")).toBeInTheDocument();
    });

    const meCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      return url.includes("/api/users/me");
    });
    expect(meCalls.length).toBe(0);

    const legacyPreviewCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      return url.includes("/api/preview/compatibility-score");
    });
    expect(legacyPreviewCalls.length).toBe(0);
  });

  it("advances to file_selected immediately and continues upload state independent of JD", async () => {
    window.history.pushState({}, "test", "/?debugCheckFit=1");

    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/preview/extract-resume-text")) {
        return createResponse({ resumeText: "Resume text" }, true, 200);
      }
      if (url.includes("/api/preview/canonical-fit-score")) {
        return createResponse({ score: 77, scoreBand: "MID" }, true, 200);
      }
      return createResponse({});
    });

    render(<LandingPage isAuthenticated={false} />);

    const input = await screen.findByTestId("landing-resume-input");
    const file = new File(["Resume text"], "resume.pdf", { type: "application/pdf" });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/lastStep:\s*upload_succeeded/i)).toBeInTheDocument();
    });

    // JD empty keeps CTA disabled for the intended reason (jdReady), not because upload stranded.
    expect(screen.getByText(/jdReady:\s*false/i)).toBeInTheDocument();
    expect(screen.getByText(/isPreviewLoading:\s*false/i)).toBeInTheDocument();
  });

  it("auth bootstrap failure diagnostics do not block landing upload interaction", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/preview/extract-resume-text")) {
        return createResponse({ resumeText: "Resume text" }, true, 200);
      }
      if (url.includes("/api/preview/canonical-fit-score")) {
        return createResponse({ score: 55, scoreBand: "LOW" }, true, 200);
      }
      return createResponse({});
    });

    render(<LandingPage isAuthenticated={false} />);

    act(() => {
      window.dispatchEvent(new CustomEvent("ttr:auth-bootstrap", { detail: { stage: "failed" } }));
    });

    const input = await screen.findByTestId("landing-resume-input");
    const file = new File(["Resume text"], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/authBootstrapFailed:\s*true/i)).toBeInTheDocument();
      expect(screen.getByText(/lastStep:\s*upload_succeeded/i)).toBeInTheDocument();
    });
  });
});
