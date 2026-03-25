import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

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
  const stringBody = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
  };
}

function renderTarget() {
  overrideSearchParams({ baselineId: "base-1", jobId: "job-1" });
  render(
    <BaselineWorkspace
      initialBaselines={
        [
          {
            id: "base-1",
            originalFilename: "resume.pdf",
            version: 1,
          },
        ] as never
      }
      initialFetchError={null}
      initialBaselineId="base-1"
      initialJobId="job-1"
    />,
  );
}

describe("Target generation authority", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
    });
  });

  it("READY shows generate CTA and routes to Studio", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : "url" in input ? input.url : String(input);
        if (url.includes("/latest")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "assessment-ready",
              baselineId: "base-1",
              jobId: "job-1",
              score: 92,
              strengths: ["Strong leadership evidence."],
            }),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: "Load last run" }));

    await waitFor(() => {
      expect(screen.getByText("Generation status: READY")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Open Studio" })).toHaveAttribute(
      "href",
      "/studio?jobId=job-1&baselineId=base-1",
    );
  });

  it("LIMITED shows constrained CTA language and does not promise unrestricted generation", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : "url" in input ? input.url : String(input);
        if (url.includes("/latest")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "assessment-limited",
              baselineId: "base-1",
              jobId: "job-1",
              score: 91,
              strengths: ["Strong leadership evidence."],
              complianceFlags: [{ code: "limited_personalization", severity: "warn", message: "Limited." }],
            }),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: "Load last run" }));

    await waitFor(() => {
      expect(screen.getByText("Generation status: LIMITED")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Open Studio With Limits" })).toBeInTheDocument();
    expect(screen.queryByText("Ready to generate tailored materials now.")).toBeNull();
  });

  it("BLOCKED routes to remediation and does not offer Generate Tailored Materials", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : "url" in input ? input.url : String(input);
        if (url.includes("/latest")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "assessment-blocked",
              baselineId: "base-1",
              jobId: "job-1",
              score: 95,
              strengths: ["Strong leadership evidence."],
              complianceFlags: [{ code: "missing_baseline_support", severity: "block", message: "Blocked." }],
            }),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: "Load last run" }));

    await waitFor(() => {
      expect(screen.getByText("Generation status: BLOCKED")).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "Generate Tailored Materials" })).toBeNull();
    expect(screen.getByRole("link", { name: "Fix baseline and continue" })).toHaveAttribute(
      "href",
      "/results?assessmentId=assessment-blocked",
    );
  });

  it("blocked target flow cannot bypass into Studio-ready path", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : "url" in input ? input.url : String(input);
        if (url.includes("/latest")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "assessment-guard",
              baselineId: "base-1",
              jobId: "job-1",
              score: 93,
              complianceFlags: [{ code: "fictional_technology", severity: "block", message: "Blocked." }],
            }),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: "Load last run" }));
    await waitFor(() => {
      expect(screen.getByText("Generation status: BLOCKED")).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: "Open Studio With Limits" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Generate Tailored Materials" })).toBeNull();
  });

  it("before readiness/result resolves, target does not falsely present generation green-light", () => {
    setFetchImplementation(vi.fn(() => Promise.resolve(createResponse({}))));
    renderTarget();
    expect(screen.queryByRole("link", { name: "Generate Tailored Materials" })).toBeNull();
    expect(screen.queryByText("Generation status: READY")).toBeNull();
  });
});
