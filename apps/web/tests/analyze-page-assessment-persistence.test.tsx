import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AnalyzePage from "@/app/(app)/analyze/page";
import { mockRouterPush, setFetchImplementation } from "@/tests/setup";
import { publishBaselineUpdated } from "@/src/lib/baseline-sync";

vi.mock("@/app/(app)/lib/session", async () => {
  const actual = await vi.importActual("@/app/(app)/lib/session");
  return {
    ...actual,
    readLastAnalysis: vi.fn(() => null),
    saveLastAnalysis: vi.fn(),
  };
});

vi.mock("@/src/lib/baseline-sync", () => ({
  publishBaselineUpdated: vi.fn(),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Analyze page assessment persistence contract", () => {
  beforeEach(() => {
    const storageMock: Storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 0,
    };
    Object.defineProperty(window, "localStorage", { value: storageMock, configurable: true });
    Object.defineProperty(window, "sessionStorage", { value: storageMock, configurable: true });
  });

  it("submits /api/analysis/run with the exact selected baselineId and routes by assessmentId", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/baselines")) {
        return jsonResponse([
          {
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            versions: [{ id: "v-1", versionNumber: 1 }],
          },
          {
            id: "base-2",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-02T00:00:00.000Z",
            versions: [{ id: "v-2", versionNumber: 1 }],
          },
        ]);
      }
      if (url.includes("/api/jobs")) {
        return jsonResponse([
          {
            id: "job-1",
            title: "Ops Lead",
            company: "Acme",
            rawDescription: "Lead operations",
            createdAt: "2026-01-03T00:00:00.000Z",
          },
        ]);
      }
      if (url.includes("/api/analysis/run")) {
        return jsonResponse(
          {
            status: "ok",
            assessmentId: "assessment-2",
            baselineId: "base-2",
            jobId: "job-1",
            score: 82,
          },
          200,
        );
      }
      return jsonResponse({}, 200);
    });
    setFetchImplementation(fetchMock as any);

    render(<AnalyzePage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/baselines",
        expect.objectContaining({ cache: "no-store" }),
      );
    });

    fireEvent.change(screen.getByLabelText("Selected baseline"), {
      target: { value: "base-2" },
    });
    fireEvent.change(screen.getByLabelText("Saved job"), {
      target: { value: "job-1" },
    });
    expect(screen.getByRole("button", { name: "Generate Compatibility Score" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate Compatibility Score" }));

    await waitFor(() => {
      const runCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes("/api/analysis/run"),
      );
      expect(runCall).toBeDefined();
      const runInit = runCall?.[1];
      expect(runInit?.method).toBe("POST");
      const payload = runInit?.body
        ? JSON.parse(runInit.body as string)
        : null;
      expect(payload).toMatchObject({
        baselineId: "base-2",
        jobId: "job-1",
        triggerType: "manual",
      });
    });

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith(
        "/results?assessmentId=assessment-2&analysisId=assessment-2",
      );
    });

    expect(publishBaselineUpdated).toHaveBeenCalledWith({
      baselineId: "base-2",
      source: "analysis",
    });
  });

  it("does not navigate when analysis response has no persisted assessmentId", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/baselines")) {
        return jsonResponse([
          {
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            versions: [{ id: "v-1", versionNumber: 1 }],
          },
        ]);
      }
      if (url.includes("/api/jobs")) {
        return jsonResponse([
          {
            id: "job-1",
            title: "Ops Lead",
            company: "Acme",
            rawDescription: "Lead operations",
            createdAt: "2026-01-03T00:00:00.000Z",
          },
        ]);
      }
      if (url.includes("/api/analysis/run")) {
        return jsonResponse({ status: "ok", score: 77, baselineId: "base-1", jobId: "job-1" }, 200);
      }
      return jsonResponse({}, 200);
    });
    setFetchImplementation(fetchMock as any);

    render(<AnalyzePage />);

    fireEvent.change(await screen.findByLabelText("Selected baseline"), {
      target: { value: "base-1" },
    });
    fireEvent.change(screen.getByLabelText("Saved job"), {
      target: { value: "job-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate Compatibility Score" }));

    await waitFor(() => {
      expect(
        screen.getByText("Analysis completed but no persisted assessment record was returned."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Compatibility Score")).not.toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("does not render completed-analysis score when returned baselineId mismatches selected baseline", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/baselines")) {
        return jsonResponse([
          {
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            versions: [{ id: "v-1", versionNumber: 1 }],
          },
        ]);
      }
      if (url.includes("/api/jobs")) {
        return jsonResponse([
          {
            id: "job-1",
            title: "Ops Lead",
            company: "Acme",
            rawDescription: "Lead operations",
            createdAt: "2026-01-03T00:00:00.000Z",
          },
        ]);
      }
      if (url.includes("/api/analysis/run")) {
        return jsonResponse(
          {
            status: "ok",
            assessmentId: "assessment-1",
            baselineId: "other-baseline",
            jobId: "job-1",
            score: 90,
          },
          200,
        );
      }
      if (url.includes("/api/fit-scores")) {
        return jsonResponse({ score: 99 }, 200);
      }
      return jsonResponse({}, 200);
    });
    setFetchImplementation(fetchMock as any);

    render(<AnalyzePage />);

    fireEvent.change(await screen.findByLabelText("Selected baseline"), {
      target: { value: "base-1" },
    });
    fireEvent.change(screen.getByLabelText("Saved job"), {
      target: { value: "job-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate Compatibility Score" }));

    await waitFor(() => {
      expect(
        screen.getByText("Analysis baseline linkage mismatch. Please retry."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Compatibility Score")).not.toBeInTheDocument();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});
