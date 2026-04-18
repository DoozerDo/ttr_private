import { expect, test } from "@playwright/test";

import { syntheticUserPassword } from "./synthetic-config";

test.describe("70+ generation unlock (missing baselineVersionId)", () => {
  test("Studio does not block on missing baselineVersionId and sends generation request", async ({ page }) => {
    test.setTimeout(180_000);
    // Uses the local dev seed user created by `npm -w apps/api run seed:local-score`.
    const email = "local-score-seed@targetthisrole.test";
    const password = "LocalScore123!";

    const loginResponse = await page.request.post("/api/auth/login", {
      data: { email, password },
    });
    expect(loginResponse.ok(), `login failed: ${loginResponse.status()}`).toBeTruthy();

    const meResponse = await page.request.get("/api/users/me");
    expect(meResponse.ok(), `me fetch failed after login: ${meResponse.status()}`).toBeTruthy();

    await page.goto("/baseline", { waitUntil: "domcontentloaded" });

    // Locate the seeded baseline + job ids from the running local API via the web proxy routes.
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

    // Create a real assessment via the API so Studio/Results paths are fully runtime-real.
    const runResponse = await page.request.post("/api/analysis/run", {
      data: { baselineId, jobId },
    });
    expect(runResponse.ok(), `analysis.run failed: ${runResponse.status()}`).toBeTruthy();
    const runPayload = (await runResponse.json()) as { assessmentId?: string; score?: number };
    expect(typeof runPayload.assessmentId).toBe("string");
    expect(typeof runPayload.score).toBe("number");
    expect((runPayload.score ?? 0) >= 70, `seed analysis score was below 70: ${runPayload.score}`).toBeTruthy();
    const assessmentId = runPayload.assessmentId as string;

    const observedResponses: Array<{ url: string; status: number }> = [];
    page.on("response", (resp) => {
      const url = resp.url();
      if (
        url.includes("/api/users/me") ||
        url.includes("/api/baselines") ||
        url.includes("/api/jobs") ||
        url.includes("/api/analysis/fit-assessments/") ||
        url.includes("/api/resume/readiness") ||
        url.includes("/api/cover-letters/readiness") ||
        url.includes("/api/studio/artifacts")
      ) {
        observedResponses.push({ url, status: resp.status() });
      }
    });

    const readinessRequests: Array<Record<string, unknown>> = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/resume/readiness") || req.url().includes("/api/cover-letters/readiness")) {
        try {
          const body = req.postDataJSON() as Record<string, unknown>;
          readinessRequests.push({ url: req.url(), body });
        } catch {
          readinessRequests.push({ url: req.url(), body: null });
        }
      }
    });

    // Results: generation CTA must be visible at 70+ even with no promoted baseline version.
    await page.goto(
      `/results?assessmentId=${encodeURIComponent(assessmentId)}&jobId=${encodeURIComponent(jobId)}&baselineId=${encodeURIComponent(baselineId)}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.getByRole("button", { name: /generate documents/i })).toBeVisible();
    expect(page.getByText(/promote/i)).not.toBeVisible();
    expect(page.getByText(/interview/i)).not.toBeVisible();

    await page.getByRole("button", { name: /generate documents/i }).click();
    // Results may stay in-place during recovery/finalizing; navigate explicitly to Studio for the same pair.
    await page.goto(
      `/studio?analysisId=${encodeURIComponent(assessmentId)}&jobId=${encodeURIComponent(jobId)}&baselineId=${encodeURIComponent(baselineId)}`,
      { waitUntil: "domcontentloaded" },
    );

    await expect(page.getByTestId("studio-generation-readiness")).toBeVisible({ timeout: 30_000 });

    const failures = observedResponses.filter((entry) => entry.status >= 400);
    expect(failures, `observed failing responses: ${JSON.stringify(failures, null, 2)}`).toEqual([]);

    const readinessEl = page.getByTestId("studio-generation-readiness");
    await expect.poll(() => readinessEl.getAttribute("data-runtime-analysis-id")).toBe(assessmentId);
    await expect.poll(() => readinessEl.getAttribute("data-runtime-baseline-id"), { timeout: 30_000 }).toBe(baselineId);
    await expect.poll(() => readinessEl.getAttribute("data-runtime-job-id"), { timeout: 30_000 }).toBe(jobId);

    // Critical runtime contract: missing baselineVersionId must not short-circuit readiness fetches.
    if (readinessRequests.length === 0) {
      throw new Error(
        `no readiness requests observed; observedResponses=${JSON.stringify(observedResponses, null, 2)}`,
      );
    }
    for (const entry of readinessRequests) {
      const body = entry.body as Record<string, unknown> | null;
      expect(body && typeof body === "object").toBeTruthy();
      expect(body).toMatchObject({
        analysisId: assessmentId,
        jobId,
        baselineId,
      });
      expect(Object.prototype.hasOwnProperty.call(body ?? {}, "baselineVersionId")).toBe(false);
    }

    // Resume generation must send a request even without baselineVersionId.
    const resumeRequests: Array<Record<string, unknown>> = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/resume") && req.method() === "POST") {
        try {
          resumeRequests.push(req.postDataJSON() as Record<string, unknown>);
        } catch {
          resumeRequests.push({ parseError: true });
        }
      }
    });

    const generateResumeButton = page.getByRole("button", { name: "Generate Resume", exact: true });
    await expect(generateResumeButton).toBeEnabled();
    await generateResumeButton.click();

    await expect.poll(() => resumeRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);
    const resumeBody = resumeRequests[0] as Record<string, unknown>;
    expect(resumeBody).toMatchObject({
      documentType: "resume",
      analysisId: assessmentId,
      jobId,
      baselineId,
    });
    expect(Object.prototype.hasOwnProperty.call(resumeBody ?? {}, "baselineVersionId")).toBe(false);
  });
});
