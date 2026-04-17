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

  it("keeps the target view on the baseline continuation path when the run stays ready", async () => {
    setFetchImplementation(
      vi.fn((input: RequestInfo) => {
        const url = typeof input === "string" ? input : "url" in input ? input.url : String(input);
        if (url.includes("/latest")) {
          return Promise.resolve(
            createResponse({
              assessmentId: "assessment-ready",
              baselineId: "base-1",
              jobId: "job-1",
              score: 95,
              strengths: ["Strong leadership evidence."],
            }),
          );
        }
        return Promise.resolve(createResponse({}));
      }),
    );
    renderTarget();
    fireEvent.click(screen.getByRole("button", { name: "Previous result for this role" }));
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Generate documents" })).toBeInTheDocument();
    });
    expect(screen.queryByText("Generation status: BLOCKED")).toBeNull();
    expect(screen.queryByRole("link", { name: "ANALYZE" })).toBeNull();
  });

  it("before readiness/result resolves, target does not falsely present generation green-light", () => {
    setFetchImplementation(vi.fn(() => Promise.resolve(createResponse({}))));
    renderTarget();
    expect(screen.queryByRole("link", { name: "ANALYZE" })).toBeNull();
    expect(screen.queryByText("Generation status: READY")).toBeNull();
  });
});
