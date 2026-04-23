import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowActivityBanner } from "@/components/workflow/WorkflowActivityBanner";
import { useWorkflowActivityTracker } from "@/lib/workflowActivityTracker";

function Harness() {
  const tracker = useWorkflowActivityTracker({
    surface: "results",
    transitionMs: 200,
  });

  return (
    <div>
      <WorkflowActivityBanner tracker={tracker.snapshot} />
      <button
        type="button"
        data-testid="start-analysis"
        disabled={tracker.snapshot.isActive}
        onClick={() => tracker.start("analysis_running")}
      >
        Start analysis
      </button>
      <button type="button" data-testid="start-unlock" onClick={() => tracker.start("unlock_reanalysis_running")}>
        Start unlock
      </button>
      <button type="button" data-testid="start-gen" onClick={() => tracker.start("generation_running")}>
        Start generation
      </button>
      <button
        type="button"
        data-testid="stop-analysis"
        onClick={() => void tracker.stop("analysis_running", "success")}
      >
        Stop analysis
      </button>
      <button type="button" data-testid="stop-unlock" onClick={() => void tracker.stop("unlock_reanalysis_running", "success")}>
        Stop unlock
      </button>
      <button type="button" data-testid="stop-gen" onClick={() => void tracker.stop("generation_running", "failure")}>
        Stop generation
      </button>
      <div data-testid="failure-shell">Failure shell</div>
    </div>
  );
}

describe("WorkflowActivityBanner", () => {
  it("renders analysis copy and disables duplicate CTAs while active", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    expect(screen.queryByTestId("workflow-activity-banner")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("start-analysis"));
    });
    expect(screen.getByTestId("workflow-activity-banner")).toHaveTextContent("Analyzing your fit...");
    expect(screen.getByTestId("start-analysis")).toBeDisabled();
    expect(screen.getByTestId("failure-shell")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("stop-analysis"));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.queryByTestId("workflow-activity-banner")).toBeNull();
    vi.useRealTimers();
  });

  it("prioritizes generation over unlock over analysis and hides after completion cooldown", async () => {
    vi.useFakeTimers();
    render(<Harness />);

    await act(async () => {
      fireEvent.click(screen.getByTestId("start-analysis"));
    });
    expect(screen.getByTestId("workflow-activity-banner")).toHaveTextContent("Analyzing your fit...");

    await act(async () => {
      fireEvent.click(screen.getByTestId("start-unlock"));
    });
    expect(screen.getByTestId("workflow-activity-banner")).toHaveTextContent("Re-evaluating your updates...");

    await act(async () => {
      fireEvent.click(screen.getByTestId("start-gen"));
    });
    expect(screen.getByTestId("workflow-activity-banner")).toHaveTextContent("Generating your documents...");

    await act(async () => {
      fireEvent.click(screen.getByTestId("stop-gen"));
      fireEvent.click(screen.getByTestId("stop-unlock"));
      fireEvent.click(screen.getByTestId("stop-analysis"));
    });

    // Cooldown keeps the banner mounted briefly.
    expect(screen.getByTestId("workflow-activity-banner")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.queryByTestId("workflow-activity-banner")).toBeNull();
    vi.useRealTimers();
  });
});
