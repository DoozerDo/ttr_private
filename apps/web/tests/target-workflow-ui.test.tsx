import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import TargetPage from "@/app/(app)/target/page";
import {
  buildTargetWorkflowSteps,
  useTargetWorkflowState,
} from "@/app/(app)/baseline/BaselineWorkspace";
import { WorkspaceRunner } from "@/app/(app)/baseline/_components/WorkspaceRunner";
import { JobIngestionForm } from "@/app/(app)/jobs/_components/JobIngestionForm";
import { trackEvent } from "@/src/lib/analytics";
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
  beforeEach(() => {
    vi.mocked(trackEvent).mockClear();
  });

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

  it("renders the momentum first target copy from Studio without resetting the baseline", async () => {
    overrideSearchParams({
      baselineId: "base-1",
      entry: "studio_post_apply",
    });
    setFetchImplementation(
      vi.fn(() => Promise.resolve(createResponse([{ id: "base-1", originalFilename: "resume.pdf" }]))),
    );

    const element = await TargetPage({ searchParams: { baselineId: "base-1", entry: "studio_post_apply" } });
    render(element);

    expect(screen.getByRole("heading", { name: "Let's find your next role" })).toBeInTheDocument();
    expect(screen.getByText("Your baseline is ready. Paste the next job and we will score it.")).toBeInTheDocument();
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

  it("tracks momentum job input focus, paste, and score start when a new role is submitted", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url === "/api/jobs" && init?.method === "POST") {
        return Promise.resolve(
          createResponse({
            id: "job-created-1",
            title: "Support Manager",
            company: "Acme",
          }),
        );
      }
      return Promise.resolve(createResponse({}));
    });
    setFetchImplementation(fetchMock as typeof fetchMock);

    const onResolved = vi.fn();
    render(
      <JobIngestionForm
        momentumEntry
        baselineId="base-1"
        entrySource="studio_post_apply"
        autoFocusDescription
        onResolved={onResolved}
        onCancel={() => {}}
      />,
    );

    const textarea = screen.getByLabelText("Job description");
    await waitFor(() => expect(textarea).toHaveFocus());

    fireEvent.paste(textarea, {
      clipboardData: {
        getData: () => "Lead support operations with measurable outcomes.",
      },
    });
    fireEvent.change(textarea, {
      target: { value: "Lead support operations with measurable outcomes." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze next role" }));

    await waitFor(() => {
      expect(onResolved).toHaveBeenCalledWith("job-created-1");
    });

    expect(trackEvent).toHaveBeenCalledWith(
      "target_momentum_entry_viewed",
      expect.objectContaining({
        source: "studio_post_apply",
        baselineId: "base-1",
        jobId: null,
      }),
    );
    expect(trackEvent).toHaveBeenCalledWith(
      "target_job_input_focused",
      expect.objectContaining({
        source: "studio_post_apply",
        baselineId: "base-1",
        jobId: null,
      }),
    );
    expect(trackEvent).toHaveBeenCalledWith(
      "target_job_pasted",
      expect.objectContaining({
        source: "studio_post_apply",
        baselineId: "base-1",
        jobId: null,
        pastedLength: 49,
      }),
    );
    expect(trackEvent).toHaveBeenCalledWith(
      "target_score_started_from_momentum",
      expect.objectContaining({
        source: "studio_post_apply",
        baselineId: "base-1",
        jobId: "job-created-1",
        inputLength: 49,
      }),
    );
  });

  it("shows the placeholder when a job exists but no valid score is present", () => {
    render(<WorkspaceRunner baselineId="base-1" jobId="job-1" />);

    expect(
      screen.getByText("Add a job description to generate your compatibility score."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Score generated")).toBeNull();
  });
});
