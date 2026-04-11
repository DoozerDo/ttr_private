import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import BugReportingAdminPage from "@/app/(app)/admin/bug-reporting/page";
import { FALLBACK_RENDERED_TEXT } from "@/lib/renderedText";
import { setFetchImplementation } from "./setup";

function createResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  const stringBody = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(stringBody),
  };
}

describe("admin bug reporting page", () => {
  it("sanitizes malformed support payloads before rendering", async () => {
    setFetchImplementation(
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.includes("/api/admin/bug-reports")) {
          return createResponse({
            items: [
              {
                id: "bug-1",
                createdAt: "2026-04-01T00:00:00.000Z",
                route: "/studio",
                description: "{{broken bug description}}",
                whatHappened: "{{broken fallback}}",
                userId: "user-1",
                baselineId: "base-1",
                jobId: "job-1",
                assessmentId: "analysis-1",
                score: 74,
                nextAction: "{{bad next action}}",
                status: "open",
                severity: "medium",
              },
            ],
          });
        }
        if (url.includes("/api/admin/synthetic-transactions/core-loop-smoke/runs")) {
          return createResponse([
            {
              id: "run-1",
              startedAt: "2026-04-01T00:00:00.000Z",
              finishedAt: "2026-04-01T00:02:00.000Z",
              status: "failed",
              errorMessage: "{{broken synthetic error}}",
              summaryJson: { baselineId: "base-1", jobId: "job-1", assessmentId: "analysis-1", score: 74, nextAction: "{{bad}}" },
            },
          ]);
        }
        return createResponse({}, false, 500);
      }),
    );

    render(<BugReportingAdminPage />);

    await waitFor(() => {
      expect(screen.getAllByText(FALLBACK_RENDERED_TEXT).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("{{broken bug description}}")).toBeNull();
    expect(screen.queryByText("{{broken synthetic error}}")).toBeNull();
  });
});
