import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";

import { BaselineDashboard } from "@/app/(app)/baseline/baseline-dashboard";
import { mockPathname, mockRouterPush, mockRouterRefresh, setFetchImplementation } from "./setup";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
    },
    json: () => Promise.resolve(body),
  };
}

describe("BaselineDashboard target mode", () => {
  it("hides baseline-building controls and keeps selection actions available", async () => {
    setFetchImplementation(
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.includes("/api/baselines/base-1")) {
          return createResponse({
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
            status: "ACTIVE",
            sections: [],
            latestAssessmentSummary: null,
          });
        }
        return createResponse([]);
      }),
    );

    render(
      <BaselineDashboard
        initialBaselines={[
          {
            id: "base-1",
            originalFilename: "resume.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
            status: "ACTIVE",
            latestAssessmentSummary: null,
          } as never,
        ]}
        selectedBaselineId="base-1"
        showBaselineCreationControls={false}
      />,
    );

    expect(screen.queryByRole("button", { name: /Add resume/i })).toBeNull();
    expect(screen.queryByText(/Continue Building Baseline/i)).toBeNull();
    expect(screen.queryByText(/Completing more areas improves/i)).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /View details/i })).toHaveAttribute(
        "href",
        "/baseline/base-1",
      );
    });
  });

  it("archives the selected baseline with the canonical id and reselects the newest remaining active baseline", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;

      if (url.includes("/api/baselines/base-2/archive") && init?.method === "PATCH") {
        return createResponse({
          id: "base-2",
          originalFilename: "resume-2.pdf",
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
          status: "ARCHIVED",
          archivedAt: "2026-04-01T00:00:00.000Z",
          sections: [],
          latestAssessmentSummary: null,
        });
      }

      if (url.includes("/api/baselines?includeArchived=true")) {
        return createResponse([
          {
            id: "base-2",
            originalFilename: "resume-2.pdf",
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
            status: "ARCHIVED",
            archivedAt: "2026-04-01T00:00:00.000Z",
            sections: [],
            latestAssessmentSummary: null,
          },
          {
            id: "base-1",
            originalFilename: "resume-1.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
            status: "ACTIVE",
            sections: [],
            latestAssessmentSummary: null,
          },
        ]);
      }

      if (url.includes("/api/baselines/base-2")) {
        return createResponse({
          id: "base-2",
          originalFilename: "resume-2.pdf",
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          status: "ACTIVE",
          sections: [],
          latestAssessmentSummary: null,
        });
      }

      if (url.includes("/api/baselines/base-1")) {
        return createResponse({
          id: "base-1",
          originalFilename: "resume-1.pdf",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          status: "ACTIVE",
          sections: [],
          latestAssessmentSummary: null,
        });
      }

      return createResponse([]);
    });
    setFetchImplementation(fetchMock);
    mockPathname.mockReturnValue("/baseline");

    render(
      <BaselineDashboard
        initialBaselines={[
          {
            id: "base-2",
            originalFilename: "resume-2.pdf",
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
            status: "ACTIVE",
            latestAssessmentSummary: null,
          } as never,
          {
            id: "base-1",
            originalFilename: "resume-1.pdf",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
            status: "ACTIVE",
            latestAssessmentSummary: null,
          } as never,
        ]}
        selectedBaselineId="base-2"
        showBaselineCreationControls={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: /View details/i })[0]).toHaveAttribute(
        "href",
        "/baseline/base-2",
      );
    });

    fireEvent.click(screen.getAllByRole("button", { name: /overflow actions/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/baselines/base-2/archive",
        expect.objectContaining({ method: "PATCH" }),
      );
      expect(mockRouterPush).toHaveBeenCalledWith("/baseline?baselineId=base-1");
      expect(mockRouterRefresh).toHaveBeenCalled();
    });
  });
});
