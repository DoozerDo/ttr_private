import type { ReactNode } from "react";
import { Component, useEffect, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { test } from "vitest";

import ErrorPage from "@/app/error";
import AnalyzePage from "@/app/analyze/page";
import CoverLettersPage from "@/app/cover-letters/page";
import JobIngestionPage from "@/app/jobs/new/page";
import { BaselineDashboard } from "@/app/baseline/baseline-dashboard";
import ResultsPage from "@/app/results/page";
import FitReviewClient from "@/app/fit-review/FitReviewClient";
import SearchSetsPage from "@/app/search-sets/page";
import { overrideSearchParams } from "../setup";

type FlowConfig = {
  name: string;
  Component: React.ComponentType<any>;
  props?: Record<string, unknown>;
};

const flows: FlowConfig[] = [
  { name: "Job ingestion", Component: JobIngestionPage },
  { name: "Analyze console", Component: AnalyzePage },
  { name: "Fit review", Component: FitReviewClient },
  {
    name: "Baseline dashboard",
    Component: BaselineDashboard,
    props: { initialBaselines: [], initialFetchError: null },
  },
  { name: "Search sets", Component: SearchSetsPage },
  { name: "Cover letters", Component: CoverLettersPage },
  { name: "Resume builder", Component: ResultsPage },
];

const flowCases = flows.map((flow) => [flow.name, flow] as const);

function ErrorTrigger({ children }: { children: ReactNode }) {
  const [shouldThrow, setShouldThrow] = useState(false);

  useEffect(() => {
    setShouldThrow(true);
  }, []);

  if (shouldThrow) {
    throw new Error("Simulated route crash");
  }

  return <>{children}</>;
}

class TestErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch() {
    /* noop */
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return <ErrorPage error={this.state.error} reset={this.reset} />;
    }

    return this.props.children;
  }
}

test.each(flowCases)(
  "%s routes fall back to the shared error page when they crash",
  async (_name, flow) => {
    if (flow.Component === FitReviewClient) {
      overrideSearchParams({ jobId: "boundary-job" });
    }

    render(
      <TestErrorBoundary>
        <ErrorTrigger>
          <flow.Component {...(flow.props ?? {})} />
        </ErrorTrigger>
      </TestErrorBoundary>,
    );

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });
  },
);
