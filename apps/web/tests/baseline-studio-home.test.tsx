import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";

import { BaselineStudioHome } from "@/app/(app)/baseline/BaselineStudioHome";
import { setFetchImplementation } from "@/tests/setup";

function createBaseline(id: string, createdAt: string, filename = `${id}.pdf`) {
  return {
    id,
    userId: "user-1",
    version: 1,
    originalFilename: filename,
    mimeType: "application/pdf",
    storagePath: `/tmp/${id}`,
    hash: null,
    status: "ACTIVE" as const,
    archivedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function createAnalyzedBaseline(id: string, filename = `${id}.pdf`) {
  return {
    ...createBaseline(id, "2026-01-01T00:00:00.000Z", filename),
    sections: [
      {
        id: "section-1",
        baselineId: id,
        sectionType: "EXPERIENCE" as const,
        title: "Director, Customer Operations",
        content:
          "2021-2025 Led customer operations, incident response, platform tooling, cross-functional coordination, and measured impact with CSAT and SLA improvements.",
        includePolicy: "always" as const,
        order: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "section-2",
        baselineId: id,
        sectionType: "SUMMARY" as const,
        title: "Summary",
        content:
          "Customer operations leadership, process architecture, change leadership, support tooling ecosystems, and quantified business impact.",
        includePolicy: "always" as const,
        order: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

function createJsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("BaselineStudioHome", () => {
  beforeEach(() => {
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("renders certification progress checklist when baseline is not yet certified", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(createAnalyzedBaseline("base-1", "resume-1.pdf"));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BaselineStudioHome baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]} />);
    fireEvent.click(screen.getByRole("button", { name: "DETERMINE BASELINE STRENGTH" }));

    await waitFor(() => {
      expect(screen.getByText("CERTIFICATION IN PROGRESS")).toBeInTheDocument();
    });

    expect(screen.getByText(/Signals strong:/i)).toBeInTheDocument();
    expect(screen.getByText(/Identified signals:/i)).toBeInTheDocument();
    expect(screen.getByText(/Developing signals:/i)).toBeInTheDocument();
    expect(screen.getByText(/Quantified impact:/i)).toBeInTheDocument();
    expect(screen.getByText(/Analyses completed:/i)).toBeInTheDocument();
  });

  it("renders developing-only diagnosis area and no signal effect panel", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(createAnalyzedBaseline("base-1", "resume-1.pdf"));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BaselineStudioHome baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]} />);
    fireEvent.click(screen.getByRole("button", { name: "DETERMINE BASELINE STRENGTH" }));

    await waitFor(() => {
      expect(screen.getByText("Professional Signals Diagnosis")).toBeInTheDocument();
    });

    expect(screen.getByText("Identified Signals")).toBeInTheDocument();
    expect(screen.getByText("Strong Signals")).toBeInTheDocument();
    expect(screen.getAllByText("Developing Signals").length).toBeGreaterThan(0);
    expect(screen.queryByText("Signal Effect")).not.toBeInTheDocument();
  });

  it("renders strengthening entries from developing signals and supports modal proposal review", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(createAnalyzedBaseline("base-1", "resume-1.pdf"));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BaselineStudioHome baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]} />);
    fireEvent.click(screen.getByRole("button", { name: "DETERMINE BASELINE STRENGTH" }));

    await waitFor(() => {
      expect(screen.getByText("Baseline Strengthening")).toBeInTheDocument();
    });

    const developingSignalButtons = screen.getAllByRole("button", { name: "Strengthen This Signal" });
    expect(developingSignalButtons.length).toBeGreaterThan(0);

    fireEvent.click(developingSignalButtons[0]);
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Strengthen Signal" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "I led the escalation process redesign and reduced incident resolution time by 18%." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate Proposed Update" }));

    await waitFor(() => {
      expect(screen.getByText("Proposed baseline update")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Approve and Apply" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Strengthen Signal" })).not.toBeInTheDocument();
    });
  });

  it("shows career gravity locked under 3 completed role analyses", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([{ id: "run-1", status: "completed", score: 70 }]);
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(createAnalyzedBaseline("base-1", "resume-1.pdf"));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BaselineStudioHome baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]} />);
    fireEvent.click(screen.getByRole("button", { name: "DETERMINE BASELINE STRENGTH" }));

    await waitFor(() => {
      expect(screen.getByText("Career Gravity is locked")).toBeInTheDocument();
    });
    expect(screen.getByText("1 of 3 completed")).toBeInTheDocument();
  });

  it("unlocks career gravity at 3 completed role analyses", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([
          { id: "run-1", status: "completed", score: 70 },
          { id: "run-2", status: "completed", score: 74 },
          { id: "run-3", status: "completed", score: 78 },
        ]);
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(createAnalyzedBaseline("base-1", "resume-1.pdf"));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BaselineStudioHome baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]} />);
    fireEvent.click(screen.getByRole("button", { name: "DETERMINE BASELINE STRENGTH" }));

    await waitFor(() => {
      expect(screen.queryByText("Career Gravity is locked")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Your experience clusters strongly around:")).toBeInTheDocument();
  });

  it("renders score history on baseline library cards after analysis", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      if (url.includes("/api/baselines/base-1")) {
        return createJsonResponse(createAnalyzedBaseline("base-1", "resume-1.pdf"));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<BaselineStudioHome baselines={[createBaseline("base-1", "2026-01-01T00:00:00.000Z", "resume-1.pdf")]} />);
    fireEvent.click(within(screen.getByText("resume-1.pdf").closest("article") as HTMLElement).getByRole("button", { name: "DETERMINE BASELINE STRENGTH" }));

    await waitFor(() => {
      expect(screen.getByText(/% current/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/% first analysis/i)).toBeInTheDocument();
  });
});
