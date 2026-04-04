import { render, renderHook, screen } from "@testing-library/react";
import { vi } from "vitest";

import TargetPage from "@/app/(app)/target/page";
import {
  buildTargetWorkflowSteps,
  useTargetWorkflowState,
} from "@/app/(app)/baseline/BaselineWorkspace";
import { WorkspaceRunner } from "@/app/(app)/baseline/_components/WorkspaceRunner";
import { overrideSearchParams, setFetchImplementation } from "./setup";

vi.mock("@/src/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("@/app/(app)/baseline/BaselineWorkspace", async () => {
  const actual = await vi.importActual<typeof import("@/app/(app)/baseline/BaselineWorkspace")>(
    "@/app/(app)/baseline/BaselineWorkspace",
  );
  return {
    ...actual,
    BaselineWorkspace: () => <div>Baseline Workspace Mock</div>,
  };
});

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  const stringBody = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
  };
}

describe("target workflow UI", () => {
  it("derives workflow progress states from the current selection state", () => {
    expect(
      buildTargetWorkflowSteps({
        hasBaselineSelected: true,
        hasJob: false,
        hasScore: false,
      }),
    ).toMatchObject([
      { label: "Baseline selected", complete: true },
      { label: "Job added", complete: false },
      { label: "Score generated", complete: false },
    ]);

    expect(
      buildTargetWorkflowSteps({
        hasBaselineSelected: true,
        hasJob: true,
        hasScore: true,
      }),
    ).toMatchObject([
      { label: "Baseline selected", complete: true },
      { label: "Job added", complete: true },
      { label: "Score generated", complete: true },
    ]);
  });

  it("resets the score step when the active job or baseline changes", () => {
    const { result, rerender } = renderHook(
      ({ baselineId, jobId, hasMatchingScore }) =>
        useTargetWorkflowState({ baselineId, jobId, hasMatchingScore }),
      {
        initialProps: {
          baselineId: "base-1",
          jobId: "job-1",
          hasMatchingScore: true,
        },
      },
    );

    expect(result.current).toMatchObject({
      hasBaselineSelected: true,
      hasJob: true,
      hasScore: true,
    });

    rerender({
      baselineId: "base-1",
      jobId: "job-2",
      hasMatchingScore: false,
    });

    expect(result.current).toMatchObject({
      hasBaselineSelected: true,
      hasJob: true,
      hasScore: false,
    });

    rerender({
      baselineId: "base-2",
      jobId: "job-2",
      hasMatchingScore: false,
    });

    expect(result.current).toMatchObject({
      hasBaselineSelected: true,
      hasJob: true,
      hasScore: false,
    });
  });

  it("renders the target page heading copy", async () => {
    overrideSearchParams({});
    setFetchImplementation(
      vi.fn(() => Promise.resolve(createResponse([{ id: "base-1", originalFilename: "resume.pdf" }]))),
    );

    const element = await TargetPage({ searchParams: {} });
    render(element);

    expect(screen.getByRole("heading", { name: "Run a compatibility score for a role." })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Select a baseline, add a job description, and generate the score that powers Results, Studio, and the rest of the workflow.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the pre-analysis compatibility placeholder instead of a blank panel", () => {
    render(<WorkspaceRunner baselineId={null} jobId={null} />);

    expect(
      screen.getByText("Add a job description to generate your compatibility score."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your score will power Results, Studio, and the rest of the workflow."),
    ).toBeInTheDocument();
  });

  it("shows the placeholder when a job exists but no valid score is present", () => {
    render(<WorkspaceRunner baselineId="base-1" jobId="job-1" />);

    expect(
      screen.getByText("Add a job description to generate your compatibility score."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Score generated")).toBeNull();
  });
});
