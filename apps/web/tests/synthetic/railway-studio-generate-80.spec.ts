import { expect, test } from "@playwright/test";

import {
  syntheticUserEmail,
  syntheticUserPassword,
} from "./synthetic-config";

/**
 * Railway / CI requirements (no mocks, real API + web):
 *
 * Required env vars:
 * - BASE_URL: Railway web origin (e.g. "https://<web>.up.railway.app")
 * - API_BASE_URL: Railway API origin (e.g. "https://<api>.up.railway.app")
 * - SYNTHETIC_USER_EMAIL: existing user email (owns the baseline + job)
 * - SYNTHETIC_USER_PASSWORD: password for that user
 * - SYNTHETIC_STUDIO_BASELINE_ID: baselineId (UUID) owned by the user
 * - SYNTHETIC_STUDIO_JOB_ID: jobId (UUID) owned by the user
 *
 * Run:
 * - npm -w apps/web run synthetic:railway:studio-generate-80
 */

const requiredEnv = [
  "BASE_URL",
  "API_BASE_URL",
  "SYNTHETIC_USER_EMAIL",
  "SYNTHETIC_USER_PASSWORD",
  "SYNTHETIC_STUDIO_BASELINE_ID",
  "SYNTHETIC_STUDIO_JOB_ID",
] as const;

function requireEnv(name: typeof requiredEnv[number]): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var ${name}.`);
  }
  return value;
}

test.describe("Railway Studio score>=80 (no analysisId) validation", () => {
  test("studio/artifacts hydrates assessmentScore without analysisId and generation runs once each", async ({
    page,
  }) => {
    test.setTimeout(240_000);

    const missing = requiredEnv.filter((name) => !process.env[name]?.trim());
    if (missing.length) {
      throw new Error(
        `Missing required env vars for Railway validation (no mocks): ${missing.join(", ")}`,
      );
    }

    const baselineId = requireEnv("SYNTHETIC_STUDIO_BASELINE_ID");
    const jobId = requireEnv("SYNTHETIC_STUDIO_JOB_ID");

    const loginResponse = await page.request.post("/api/auth/login", {
      data: { email: syntheticUserEmail, password: syntheticUserPassword },
    });
    expect(
      loginResponse.ok(),
      `login failed: ${loginResponse.status()}`,
    ).toBeTruthy();

    const meResponse = await page.request.get("/api/users/me");
    expect(meResponse.ok(), `me fetch failed: ${meResponse.status()}`).toBeTruthy();

    const versionsResponse = await page.request.get(
      `/api/baselines/${encodeURIComponent(baselineId)}/versions`,
    );
    expect(
      versionsResponse.ok(),
      `baseline versions fetch failed: ${versionsResponse.status()}`,
    ).toBeTruthy();
    const versionsPayload = (await versionsResponse.json()) as Array<{
      id: string;
      versionNumber?: number;
    }>;
    const baselineVersionId =
      versionsPayload.find((v) => v.versionNumber === 1)?.id ?? versionsPayload[0]?.id;
    expect(typeof baselineVersionId).toBe("string");

    // Create/refresh an assessment so the latest score is >= 80.
    const runResponse = await page.request.post("/api/analysis/run", {
      data: { baselineId, jobId },
    });
    expect(
      runResponse.ok(),
      `analysis.run failed: ${runResponse.status()}`,
    ).toBeTruthy();
    const runPayload = (await runResponse.json()) as { score?: number; fit_score?: number };
    const score =
      typeof runPayload.score === "number"
        ? runPayload.score
        : typeof runPayload.fit_score === "number"
          ? runPayload.fit_score
          : null;
    expect(typeof score).toBe("number");
    expect((score ?? 0) >= 80, `assessment score below 80: ${score}`).toBeTruthy();

    // Verify hydration contract: no analysisId, but assessmentScore must be non-null and >= 80.
    const artifactsResponse = await page.request.get(
      `/api/studio/artifacts?baselineId=${encodeURIComponent(
        baselineId,
      )}&baselineVersionId=${encodeURIComponent(
        baselineVersionId!,
      )}&jobId=${encodeURIComponent(jobId)}`,
    );
    expect(
      artifactsResponse.ok(),
      `studio artifacts fetch failed: ${artifactsResponse.status()}`,
    ).toBeTruthy();
    const artifactsPayload = (await artifactsResponse.json()) as { assessmentScore?: number | null };
    expect(typeof artifactsPayload.assessmentScore).toBe("number");
    expect((artifactsPayload.assessmentScore ?? 0) >= 80).toBeTruthy();

    // Minimal interception: count generation requests (legacy + /generate).
    let resumePosts = 0;
    let coverPosts = 0;
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

    await page.goto(
      `/studio?baselineId=${encodeURIComponent(
        baselineId,
      )}&baselineVersionId=${encodeURIComponent(
        baselineVersionId!,
      )}&jobId=${encodeURIComponent(jobId)}&intent=generate`,
      { waitUntil: "domcontentloaded" },
    );

    await expect(page.getByTestId("studio-materials-completeness")).toContainText(
      "Complete set: Resume + cover letter",
      { timeout: 90_000 },
    );
    await expect(page.getByTestId("studio-resume-ready-panel")).toBeVisible();
    await expect(page.getByTestId("studio-cover-ready-panel")).toBeVisible();

    await expect.poll(() => resumePosts, { timeout: 90_000 }).toBe(1);
    await expect.poll(() => coverPosts, { timeout: 90_000 }).toBe(1);
  });
});
