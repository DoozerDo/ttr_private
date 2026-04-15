import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";

import { LandingPage } from "@/src/components/landing/LandingPage";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

class MockIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("Landing conversion pass", () => {
  it("shows a visible login route on the public landing page for unauthenticated users", () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    render(<LandingPage isAuthenticated={false} />);

    const loginLinks = screen.getAllByRole("link", { name: "Log in" });

    expect(loginLinks.some((link) => link.getAttribute("href") === "/auth/login?next=%2Fbaseline")).toBe(true);
    expect(screen.getByRole("link", { name: "Get beta access" })).toHaveAttribute("href", "/auth/signup?next=%2Fbaseline");
    expect(screen.getByTestId("landing-hero-primary-action")).toHaveTextContent("Get your fit score");
    expect(screen.getByText("Upload resume")).toBeInTheDocument();
    expect(screen.getByText("PDF or DOCX only")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Paste the full job description, including responsibilities and requirements.")).toBeInTheDocument();
    expect(screen.getByText("Upload your resume to enable scoring.")).toBeInTheDocument();
    expect(screen.getByTestId("landing-primary-action")).toBeInTheDocument();
    expect(screen.getAllByTestId("landing-primary-action")).toHaveLength(1);
  });

  it("allows unauthenticated users to run the landing preview score without redirecting to auth", async () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any);
    pushMock.mockClear();
    fetchSpy.mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes("/api/preview/extract-resume-text")) {
        return new Response(JSON.stringify({ resumeText: "Resume text" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/preview/canonical-fit-score")) {
        return new Response(JSON.stringify({ score: 55, scoreBand: "LOW" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    render(<LandingPage isAuthenticated={false} />);

    const file = new File(["Resume"], "resume.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByTestId("landing-resume-input"), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByTestId("landing-job-description-input"), {
      target: { value: "a".repeat(200) },
    });

    await waitFor(() => {
      expect(screen.getByTestId("landing-flow-state")).toHaveTextContent("input_ready");
    });

    fireEvent.click(screen.getByTestId("landing-primary-action"));

    expect(
      fetchSpy.mock.calls.some((call) =>
        String(call[0]).includes("/api/preview/canonical-fit-score"),
      ),
    ).toBe(true);

    expect(await screen.findByTestId("landing-preview-score")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("dispatches preview even when resume text + JD are large (no silent no-op)", async () => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any);
    pushMock.mockClear();

    fetchSpy.mockImplementation(async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes("/api/preview/extract-resume-text")) {
        return new Response(JSON.stringify({ resumeText: "r".repeat(120_000) }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/preview/canonical-fit-score")) {
        const bodyRaw = String(init?.body ?? "");
        // Should still fire a request, and body should remain valid JSON.
        const parsed = JSON.parse(bodyRaw) as { resumeText?: string; jobDescriptionText?: string };
        expect(typeof parsed.jobDescriptionText).toBe("string");
        expect(typeof parsed.resumeText).toBe("string");
        return new Response(JSON.stringify({ score: 61, scoreBand: "MID" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    render(<LandingPage isAuthenticated={false} />);

    const file = new File(["Resume"], "resume.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByTestId("landing-resume-input"), {
      target: { files: [file] },
    });

    fireEvent.change(screen.getByTestId("landing-job-description-input"), {
      target: { value: "j".repeat(10_000) },
    });

    await waitFor(() => {
      expect(screen.getByTestId("landing-flow-state")).toHaveTextContent("input_ready");
    });

    fireEvent.click(screen.getByTestId("landing-primary-action"));

    expect(
      fetchSpy.mock.calls.some((call) =>
        String(call[0]).includes("/api/preview/canonical-fit-score"),
      ),
    ).toBe(true);

    expect(await screen.findByTestId("landing-preview-score")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});




