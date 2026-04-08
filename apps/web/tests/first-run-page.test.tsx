import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import FirstRunPage from "@/app/first-run/page";
import { mockRedirect, setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("FirstRunPage", () => {
  it("renders a clean empty state when no active baseline exists", async () => {
    setFetchImplementation(
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/baselines?includeArchived=true")) {
          return jsonResponse([]);
        }
        return jsonResponse({}, 200);
      }) as unknown as typeof fetch,
    );

    const element = await FirstRunPage();
    const markup = renderToStaticMarkup(<>{element}</>);

    expect(markup).toContain("Start with your active baseline");
    expect(markup).toContain("Start baseline upload");
    expect(markup).toContain("#baseline-upload");
    expect(markup).not.toContain("Category:");
    expect(markup).not.toContain("Gap ");
  });

  it("redirects active-baseline users to the baseline workspace", async () => {
    setFetchImplementation(
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/baselines?includeArchived=true")) {
          return jsonResponse([
            {
              id: "baseline-1",
              status: "ACTIVE",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ]);
        }
        return jsonResponse({}, 200);
      }) as unknown as typeof fetch,
    );

    await FirstRunPage();
    expect(mockRedirect).toHaveBeenCalledWith("/baseline");
  });

  it("still shows first-run when only archived baselines exist", async () => {
    setFetchImplementation(
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/baselines?includeArchived=true")) {
          return jsonResponse([
            {
              id: "baseline-archived",
              status: "ARCHIVED",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ]);
        }
        return jsonResponse({}, 200);
      }) as unknown as typeof fetch,
    );

    const element = await FirstRunPage();
    const markup = renderToStaticMarkup(<>{element}</>);

    expect(markup).toContain("You already have 1 archived baseline in your library.");
    expect(markup).toContain("Start baseline upload");
    expect(mockRedirect).not.toHaveBeenCalledWith("/baseline");
  });
});
