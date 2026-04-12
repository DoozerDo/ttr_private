import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildSyntheticSignupEmail,
  buildSyntheticLoginEmail,
  logSyntheticStep,
  syntheticApiBaseURL,
  syntheticSignupPassword,
  syntheticUserPassword,
  syntheticIngestToken,
} from "./synthetic-config";
import { LandingSyntheticRunReporter } from "./synthetic-reliability-publisher";

test.describe("public landing synthetic transactions", () => {
  test.describe.configure({ mode: "serial" });

  const reporter = new LandingSyntheticRunReporter({
    baseURL: process.env.BASE_URL || "http://127.0.0.1:3100",
    apiBaseURL: process.env.API_BASE_URL || "http://127.0.0.1:3001",
    ingestToken: syntheticIngestToken,
    browser: "chromium",
    runMode: process.env.CI ? "ci" : "local",
  });

  test.beforeAll(async () => {
    const response = await fetch(`${syntheticApiBaseURL}/status`);
    if (!response.ok) {
      throw new Error(
        `Synthetic API preflight failed: GET ${syntheticApiBaseURL}/status returned ${response.status}`,
      );
    }
  });

  const resumeFixturePath = resolve(
    process.cwd(),
    "tests",
    "fixtures",
    "public-landing",
    "synthetic-resume.pdf",
  );
  const jobDescriptionFixturePath = resolve(
    process.cwd(),
    "tests",
    "fixtures",
    "public-landing",
    "synthetic-job-description.txt",
  );
  const shortJobDescription = "Support operations and customer experience leadership.";
  const jobDescriptionFixture = readFileSync(jobDescriptionFixturePath, "utf8").trim();
  const resumeFixture = resumeFixturePath;

  test.afterEach(async ({}, testInfo) => {
    const title = testInfo.title;
    const errorMessage = testInfo.error instanceof Error ? testInfo.error.message : null;
    const status =
      testInfo.status === "passed"
        ? "passed"
        : testInfo.status === "failed"
          ? "failed"
          : testInfo.status === "timedOut"
            ? "timedOut"
            : "skipped";

    const recordMap: Record<string, { key: string; title: string }> = {
      "landing page loads and the conversion surface is usable": {
        key: "landing.render",
        title: "Landing page loads and core conversion surface is usable",
      },
      "resume upload interaction works without dead-ending the page": {
        key: "resume.upload",
        title: "Resume upload interaction works",
      },
      "job description entry enables analysis and triggers the preview flow": {
        key: "analysis.preview",
        title: "Job description entry and score action work",
      },
      "validation states stay understandable when the JD is too short": {
        key: "validation.states",
        title: "Validation states work",
      },
      "beta signup journey reaches the intended confirmation state": {
        key: "beta.signup",
        title: "Beta signup journey works",
      },
      "login journey and post-login landing continuity work end to end": {
        key: "login.continuity",
        title: "Login journey works",
      },
    };

    const record = recordMap[title];
    if (record) {
      reporter.record({
        ...record,
        status,
        durationMs: testInfo.duration,
        errorMessage,
      });
    }
  });

  test.afterAll(async () => {
    const published = await reporter.publish();
    if (!published) {
      throw new Error("Synthetic reliability publish failed: landing/auth run was not ingested");
    }
  });

  async function openLanding(page: Page) {
    logSyntheticStep("landing.open.start");
    await page.goto("/");
    await expect(page.getByTestId("landing-hero"), "landing hero did not render").toBeVisible();
    await expect(
      page.getByTestId("landing-analysis-block"),
      "landing analysis block did not render",
    ).toBeVisible();
    await expect(page.getByTestId("landing-trust-strip"), "landing trust strip did not render").toBeVisible();
    await expect(
      page.getByTestId("landing-adjacency-radar-teaser"),
      "landing radar teaser did not render",
    ).toBeVisible();
    logSyntheticStep("landing.open.complete");
  }

  test("landing page loads and the conversion surface is usable", async ({ page }) => {
    await openLanding(page);

    const analysisBlock = page.getByTestId("landing-analysis-block");
    const primaryAction = analysisBlock.getByRole("button", { name: "Check fit" });

    await expect(
      page.getByRole("link", { name: "Get your score" }),
      "hero anchor action did not render",
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Log in" }), "landing login link did not render").toBeVisible();
    await expect(page.getByRole("link", { name: "Get beta access" }), "landing beta access link did not render").toBeVisible();
    await expect(primaryAction, "analysis block primary action missing").toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Upload resume" }),
      "resume upload button missing",
    ).toBeVisible();
    await expect(
      page.getByTestId("landing-job-description-input"),
      "job description textarea missing",
    ).toBeVisible();
  });

  test("resume upload interaction works without dead-ending the page", async ({ page }) => {
    await openLanding(page);

    const uploadInput = page.getByTestId("landing-resume-input");
    const uploadButton = page.getByRole("button", { name: "Upload resume" });
    const jobDescriptionInput = page.getByTestId("landing-job-description-input");

    await expect(page.getByText("PDF or DOCX only"), "accepted file type helper was not visible").toBeVisible();
    logSyntheticStep("resume.upload.start", { file: resumeFixturePath });
    await uploadInput.setInputFiles(resumeFixture);
    await expect(
      page.getByText("Loaded: synthetic-resume.pdf"),
      "uploaded resume filename did not render",
    ).toBeVisible();
    await expect(
      page.getByText("We extract your experience from the file. PDF and DOCX only."),
      "resume helper guidance was not visible",
    ).toBeVisible();
    await expect(uploadButton, "upload control disappeared after upload").toBeVisible();
    await expect(jobDescriptionInput, "job description input disappeared after upload").toBeVisible();
    logSyntheticStep("resume.upload.complete");
  });

  test("job description entry enables analysis and triggers the preview flow", async ({ page }) => {
    await openLanding(page);

    const uploadInput = page.getByTestId("landing-resume-input");
    const jobDescriptionInput = page.getByTestId("landing-job-description-input");
    const primaryAction = page.getByRole("button", { name: "Check fit" });

    await uploadInput.setInputFiles(resumeFixture);
    await jobDescriptionInput.fill(jobDescriptionFixture);
    await expect(primaryAction, "analysis action never enabled").toBeEnabled();

    logSyntheticStep("analysis.preview.start", {
      jobDescriptionLength: jobDescriptionFixture.length,
      hasResume: true,
    });

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/preview/compatibility-score") &&
        response.request().method() === "POST",
    );
    await primaryAction.click();
    const response = await responsePromise;

    expect(
      response.ok(),
      `compatibility preview did not complete successfully: ${response.status()} ${response.url()}`,
    ).toBeTruthy();
    await expect(
      page.getByText("Ready. Run the analysis to see your fit."),
      "analysis completion guidance was not restored",
    ).toBeVisible();
    logSyntheticStep("analysis.preview.complete", {
      status: response.status(),
    });
  });

  test("validation states stay understandable when the JD is too short", async ({ page }) => {
    await openLanding(page);

    const jobDescriptionInput = page.getByTestId("landing-job-description-input");
    const primaryAction = page.getByRole("button", { name: "Check fit" });

    await jobDescriptionInput.fill(shortJobDescription);
    await expect(primaryAction, "analysis action should be disabled for a short JD").toBeDisabled();
    await expect(
      page.getByText("Paste at least 120 characters from the job description to enable analysis."),
      "short JD helper text was not visible",
    ).toBeVisible();
    await expect(page.getByText("PDF or DOCX only"), "resume type guidance was missing").toBeVisible();
  });

  test("beta signup journey reaches the intended confirmation state", async ({ page }) => {
    await openLanding(page);

    logSyntheticStep("signup.start");
    await page.getByRole("link", { name: "Get beta access" }).click();
    await expect(page.getByRole("heading", { name: "Create an account" }), "signup form did not render").toBeVisible();

    const signupEmail = buildSyntheticSignupEmail();
    await page.getByLabel("First Name").fill("Synthetic");
    await page.getByLabel("Last Name").fill("Tester");
    await page.getByLabel("Email").fill(signupEmail);
    await page.getByLabel("Password", { exact: true }).fill(syntheticSignupPassword);
    await page.getByLabel("Confirm Password", { exact: true }).fill(syntheticSignupPassword);
    await page.getByRole("button", { name: "Create account" }).click();

    const awaitingAccessHeading = page.getByRole("heading", { name: "Your beta account is ready" });
    const verifyEmailHeading = page.getByRole("heading", { name: "Verify your email" });
    const completionState = await Promise.race([
      awaitingAccessHeading.waitFor({ state: "visible", timeout: 20_000 }).then(() => "awaiting-access"),
      verifyEmailHeading.waitFor({ state: "visible", timeout: 20_000 }).then(() => "verify-email"),
    ]);

    if (completionState === "awaiting-access") {
      await expect(awaitingAccessHeading, "awaiting-access confirmation did not render").toBeVisible();
      await expect(
        page.getByRole("link", { name: "Redeem access code" }),
        "redeem access handoff was missing",
      ).toBeVisible();
    } else {
      await expect(verifyEmailHeading, "signup verification state did not render").toBeVisible();
    }
    logSyntheticStep("signup.complete", {
      completionState,
      signupEmail,
      pathname: new URL(page.url()).pathname,
    });
  });

  test("login journey and post-login landing continuity work end to end", async ({ page }) => {
    await openLanding(page);

    logSyntheticStep("login.start");
    const loginEmail = buildSyntheticLoginEmail();
    const registerResponse = await page.request.post("/api/auth/register", {
      data: {
        firstName: "Synthetic",
        lastName: "Login",
        email: loginEmail,
        password: syntheticUserPassword,
        confirmPassword: syntheticUserPassword,
      },
    });
    expect(
      registerResponse.ok(),
      `login harness registration failed: ${registerResponse.status()}`,
    ).toBeTruthy();

    await page.getByRole("link", { name: "Log in" }).click();
    await expect(page.getByRole("heading", { name: "Log in" }), "login form did not render").toBeVisible();

    await page.getByLabel("Email").fill(loginEmail);
    await page.getByLabel("Password").fill(syntheticUserPassword);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/(awaiting-access|baseline|first-run|onboarding\/profile)/, { timeout: 20_000 });

    const authPathname = new URL(page.url()).pathname;
    if (!["/awaiting-access", "/baseline", "/first-run", "/onboarding/profile"].includes(authPathname)) {
      throw new Error(`login did not route to an authenticated destination: ${authPathname}`);
    }

    logSyntheticStep("login.complete", { pathname: authPathname, email: loginEmail });

    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Go to App" }),
      "authenticated landing nav action did not render",
    ).toBeVisible();
    await page.getByRole("link", { name: "Go to App" }).click();

    await expect
      .poll(async () => new URL(page.url()).pathname, {
        timeout: 20_000,
      })
      .toMatch(/^(\/awaiting-access|\/baseline|\/first-run|\/onboarding\/profile)$/);

    const appPathname = new URL(page.url()).pathname;
    if (!["/awaiting-access", "/baseline", "/first-run", "/onboarding/profile"].includes(appPathname)) {
      throw new Error(`authenticated landing handoff did not reach the app destination: ${appPathname}`);
    }

    logSyntheticStep("landing.continuity.complete", { pathname: appPathname });
  });
});
