import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BaselineStudioHome } from "@/app/(app)/baseline/BaselineStudioHome";
import { setFetchImplementation } from "@/tests/setup";

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("baseline upload transition", () => {
  it("promotes a qualifying upload into analyzed, validated, job-ready state", async () => {
    const uploadBaseline = {
      id: "uploaded-1",
      userId: "user-1",
      version: 1,
      originalFilename: "uploaded.pdf",
      mimeType: "application/pdf",
      storagePath: "/tmp/uploaded-1",
      hash: null,
      status: "ACTIVE",
      archivedAt: null,
      originalBaselineScore: 84,
      latestBaselineScore: 84,
      latestAssessmentSummary: {
        latestAssessmentId: "assessment-uploaded-1",
        latestAssessmentCreatedAt: "2026-03-10T00:00:00.000Z",
        latestFitScore: 84,
        hasCompletedAssessment: true,
      },
      sections: [
        {
          id: "section-1",
          baselineId: "uploaded-1",
          sectionType: "EXPERIENCE",
          title: "Director of Support",
          content: "Led customer operations and support systems.",
          includePolicy: "always",
          order: 0,
          createdAt: "2026-01-10T00:00:00.000Z",
          updatedAt: "2026-01-10T00:00:00.000Z",
        },
      ],
      createdAt: "2026-01-10T00:00:00.000Z",
      updatedAt: "2026-01-10T00:00:00.000Z",
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/baselines") && init?.method === "POST") {
        return createJsonResponse(uploadBaseline);
      }
      if (url.includes("/api/baselines?includeArchived=true")) {
        return createJsonResponse([uploadBaseline]);
      }
      if (url.includes("/api/baselines/uploaded-1")) {
        return createJsonResponse(uploadBaseline);
      }
      if (url.includes("/api/analysis/history")) {
        return createJsonResponse([]);
      }
      return createJsonResponse([]);
    });

    setFetchImplementation(fetchMock as typeof fetchMock);

    const { container } = render(<BaselineStudioHome baselines={[]} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    const file = new File(["resume content"], "uploaded.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("uploaded.pdf")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "ADD JOB DESCRIPTION" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "CONTINUE BUILDING BASELINE" })).toBeNull();
    expect(screen.queryByRole("button", { name: "UPLOAD RESUME" })).toBeNull();
  });
});
