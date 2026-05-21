import { expect, test } from "@playwright/test";

test.describe("Studio score>=80 intent=generate (missing analysisId)", () => {
  test("reaches Studio and sees a complete materials set without duplicate generation", async ({ page }) => {
    test.setTimeout(180_000);

    // Reuse the real local API seeded-user pattern from generation-unlock-70.spec.ts.
    // Seed user created by: `npm -w apps/api run seed:local-score`.
    const email = "local-score-seed@targetthisrole.test";
    const password = "LocalScore123!";

    const loginResponse = await page.request.post("/api/auth/login", { data: { email, password } });
    expect(loginResponse.ok(), `login failed: ${loginResponse.status()}`).toBeTruthy();

    const meResponse = await page.request.get("/api/users/me");
    expect(meResponse.ok(), `me fetch failed after login: ${meResponse.status()}`).toBeTruthy();

    // Locate seeded baseline + job ids from the running local API via the web proxy routes.
    const baselinesResponse = await page.request.get("/api/baselines");
    expect(baselinesResponse.ok(), `baselines fetch failed: ${baselinesResponse.status()}`).toBeTruthy();
    const baselinesPayload = (await baselinesResponse.json()) as Array<{ id: string; originalFilename?: string }>;
    const baselineId =
      baselinesPayload.find((b) => b.originalFilename === "local-score-seed-resume.pdf")?.id ??
      baselinesPayload[0]?.id;
    expect(baselineId, "seed baseline not found; run seed-local-score first").toBeTruthy();

    const jobsResponse = await page.request.get("/api/jobs");
    expect(jobsResponse.ok(), `jobs fetch failed: ${jobsResponse.status()}`).toBeTruthy();
    const jobsPayload = (await jobsResponse.json()) as Array<{ id: string; title?: string }>;
    const jobId =
      jobsPayload.find((j) => j.title === "Local scoring validation role")?.id ?? jobsPayload[0]?.id;
    expect(jobId, "seed job not found; run seed-local-score first").toBeTruthy();

    // Create a real assessment via the API so Studio paths are runtime-real.
    const runResponse = await page.request.post("/api/analysis/run", { data: { baselineId, jobId } });
    expect(runResponse.ok(), `analysis.run failed: ${runResponse.status()}`).toBeTruthy();

    const runPayload = (await runResponse.json()) as {
      assessmentId?: string;
      score?: number;
      fit_score?: number;
      overallScore?: number;
    };
    const score =
      typeof runPayload.score === "number"
        ? runPayload.score
        : typeof runPayload.fit_score === "number"
          ? runPayload.fit_score
          : typeof runPayload.overallScore === "number"
            ? runPayload.overallScore
            : null;
    expect(typeof runPayload.assessmentId).toBe("string");
    expect(typeof score).toBe("number");
    expect((score ?? 0) >= 80, `seed analysis score was below 80: ${score}`).toBeTruthy();
    const assessmentId = runPayload.assessmentId as string;

    // Studio hydration requires a UUID baselineVersionId (not a version number). Resolve it via
    // the baseline versions endpoint, since the run endpoint doesn't return it.
    const versionsResponse = await page.request.get(`/api/baselines/${encodeURIComponent(baselineId)}/versions`);
    expect(versionsResponse.ok(), `baseline versions fetch failed: ${versionsResponse.status()}`).toBeTruthy();
    const versionsPayload = (await versionsResponse.json()) as Array<{ id: string; versionNumber?: number }>;
    const baselineVersionId = versionsPayload.find((v) => v.versionNumber === 1)?.id ?? versionsPayload[0]?.id;
    expect(typeof baselineVersionId).toBe("string");

    // Minimal interception: count generation requests (legacy + /generate).
    let resumePosts = 0;
    let coverPosts = 0;
    const studioArtifactFetches: Array<{ url: string; status: number; bodySnippet?: string }> = [];
    page.on("request", (req) => {
      if (req.method() !== "POST") return;
      const url = req.url();
      if (url.includes("/api/resume") && (url.includes("/generate") || url.endsWith("/api/resume"))) {
        resumePosts += 1;
      }
      if (url.includes("/api/cover-letters") && (url.includes("/generate") || url.endsWith("/api/cover-letters"))) {
        coverPosts += 1;
      }
    });
    page.on("response", async (res) => {
      const url = res.url();
      if (!url.includes("/api/studio/artifacts")) return;
      try {
        const text = await res.text();
        studioArtifactFetches.push({
          url,
          status: res.status(),
          bodySnippet: text.slice(0, 500),
        });
      } catch {
        studioArtifactFetches.push({ url, status: res.status() });
      }
    });

    // Navigate to Studio with intent=generate and NO analysisId in URL.
    const studioUrl = `/studio?baselineId=${encodeURIComponent(baselineId)}&baselineVersionId=${encodeURIComponent(
      baselineVersionId,
    )}&jobId=${encodeURIComponent(jobId)}&intent=generate`;
    await page.goto(studioUrl, { waitUntil: "domcontentloaded" });

    // UI: generated materials present and coherent.
    await expect
      .poll(() => studioArtifactFetches.length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    try {
      await expect(page.getByTestId("studio-materials-completeness")).toContainText(
        "Complete set: Resume + cover letter",
        { timeout: 60_000 },
      );
    } catch (error) {
      throw new Error(
        `materials completeness did not render. studio_artifacts_fetches=${JSON.stringify(studioArtifactFetches, null, 2)}`,
        { cause: error as any },
      );
    }
    await expect(page.getByTestId("studio-resume-ready-panel")).toBeVisible();
    await expect(page.getByTestId("studio-cover-ready-panel")).toBeVisible();

    // UI: no missing-analysis warning or contradictory readiness shells after materials exist.
    await expect(page.getByText(/We couldnâ€™t load your analysis/i)).toHaveCount(0);
    await expect(page.getByText(/analysisId is missing/i)).toHaveCount(0);
    await expect(page.getByText(/generation is blocked/i)).toHaveCount(0);
    await expect(page.getByText(/refine before you generate/i)).toHaveCount(0);
    await expect(page.getByText(/more input needed/i)).toHaveCount(0);

    // Network: exactly one generation request per artifact.
    await expect.poll(() => resumePosts, { timeout: 60_000 }).toBe(1);
    await expect.poll(() => coverPosts, { timeout: 60_000 }).toBe(1);

    // Sanity: assessmentId was real and should be resolvable by the backend even though absent from URL.
    expect(assessmentId).toBeTruthy();

    // Diagnostics retained intentionally for this synthetic: proves Studio hit the real hydration endpoint.
    expect(studioArtifactFetches.length, `expected /api/studio/artifacts calls, got none`).toBeGreaterThan(0);
  });
});
