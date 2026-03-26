import { describe, expect, it } from "vitest";

const {
  classifyReferenceTarget,
  detectOrphanedRoutes,
  extractRouteReferencesFromSource,
  toApiRouteFromHandlerFile,
  toRouteFromPageFile,
} = require("../scripts/route-integrity-lib.js");

describe("route-integrity-lib", () => {
  it("normalizes page and api route inventory entries", () => {
    expect(toRouteFromPageFile("(app)/baseline/page.tsx")).toBe("/baseline");
    expect(toRouteFromPageFile("(public)/auth/login/page.tsx")).toBe("/auth/login");
    expect(toApiRouteFromHandlerFile("analysis/run/route.ts")).toBe("/api/analysis/run");
  });

  it("extracts Link/router/fetch route references", () => {
    const source = `
      <Link href="/baseline" />
      router.push('/results?assessmentId=abc')
      router.replace("/studio")
      fetch('/api/analysis/run', { method: "POST" })
      window.location.href = "/auth/login"
    `;
    const refs = extractRouteReferencesFromSource(source);
    expect(refs.map((x: { target: string }) => x.target)).toEqual(
      expect.arrayContaining([
        "/baseline",
        "/results",
        "/studio",
        "/api/analysis/run",
        "/auth/login",
      ]),
    );
  });

  it("classifies references and detects orphan routes", () => {
    const pageRoutes = ["/", "/baseline", "/analyze", "/results"];
    const apiRoutes = ["/api/analysis/run", "/api/baselines"];
    expect(classifyReferenceTarget("/baseline", pageRoutes, apiRoutes).type).toBe("page_route");
    expect(classifyReferenceTarget("/api/analysis/run", pageRoutes, apiRoutes).type).toBe("api_route");
    expect(classifyReferenceTarget("/missing", pageRoutes, apiRoutes).type).toBe("missing_page_route");

    const orphans = detectOrphanedRoutes(pageRoutes, ["/", "/baseline"], { excludedRoutes: [] });
    expect(orphans.map((x: { route: string }) => x.route)).toEqual(
      expect.arrayContaining(["/analyze", "/results"]),
    );
  });
});
