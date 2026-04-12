import { expect, test, type Page } from "@playwright/test";

import {
  buildSyntheticPasswordResetEmail,
  logSyntheticStep,
  passwordResetPublicJourneysSuiteKey,
  syntheticBaseURL,
  syntheticApiBaseURL,
  syntheticPasswordResetCurrentPassword,
  syntheticPasswordResetNewPassword,
  syntheticIngestToken,
} from "./synthetic-config";
import { PasswordResetSyntheticRunReporter } from "./password-reset-synthetic-reliability-publisher";

test.describe("password reset synthetic transactions", () => {
  test.describe.configure({ mode: "serial" });

  const reporter = new PasswordResetSyntheticRunReporter({
    baseURL: process.env.BASE_URL || "http://127.0.0.1:3100",
    apiBaseURL: process.env.API_BASE_URL || "http://127.0.0.1:3001",
    ingestToken: syntheticIngestToken,
    browser: "chromium",
    runMode: process.env.CI ? "ci" : "local",
  });

  const resetEmail = buildSyntheticPasswordResetEmail();
  const currentPassword = syntheticPasswordResetCurrentPassword;
  const nextPassword = syntheticPasswordResetNewPassword;

  test.beforeAll(async () => {
    const response = await fetch(`${syntheticApiBaseURL}/status`);
    if (!response.ok) {
      throw new Error(
        `Synthetic API preflight failed: GET ${syntheticApiBaseURL}/status returned ${response.status}`,
      );
    }
  });

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
      "reset request initiation works": {
        key: "reset.request",
        title: "Reset request is accepted",
      },
      "reset email retrieval and link validation work": {
        key: "reset.link",
        title: "Reset link is retrievable from the synthetic token store",
      },
      "password reset succeeds and authenticates the user": {
        key: "reset.apply",
        title: "Reset link opens and accepts a new password",
      },
      "new password login and authenticated continuity work": {
        key: "login.new-password",
        title: "New password logs in successfully",
      },
      "old password is rejected after reset": {
        key: "login.old-password",
        title: "Old password is rejected",
      },
      "reset link reuse fails cleanly": {
        key: "reset.reuse",
        title: "Reused reset link fails cleanly",
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
      throw new Error("Synthetic reliability publish failed: password reset run was not ingested");
    }
  });

  async function openLogin(page: Page) {
    logSyntheticStep("login.open.start", { resetEmail }, passwordResetPublicJourneysSuiteKey);
    await page.goto("/auth/login");
    await expect(page.getByRole("heading", { name: "Log in" }), "login form did not render").toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password?" }), "forgot password link missing").toBeVisible();
    logSyntheticStep("login.open.complete", { resetEmail }, passwordResetPublicJourneysSuiteKey);
  }

  async function getSyntheticTokenLink(page: Page, tokenType: "confirm" | "reset-password") {
    const response = await page.request.get(
      `${syntheticBaseURL}/api/admin/synthetics/user-token-link?email=${encodeURIComponent(resetEmail)}&type=${encodeURIComponent(tokenType)}`,
    );
    const payload = (await response.json().catch(() => null)) as { url?: string; link?: string; message?: string } | null;
    if (!response.ok()) {
      throw new Error(
        `Unable to retrieve ${tokenType} link for ${resetEmail}: ${payload?.message ?? response.status()}`,
      );
    }
    const url = payload?.url?.trim() || payload?.link?.trim() || "";
    if (!url) {
      throw new Error(`Synthetic token helper returned an empty ${tokenType} link for ${resetEmail}`);
    }
    return url;
  }

  async function ensureTestAccount(page: Page) {
    logSyntheticStep("account.seed.start", { resetEmail }, passwordResetPublicJourneysSuiteKey);
    const response = await page.request.post(`${syntheticBaseURL}/api/auth/register`, {
      data: {
        firstName: "Synthetic",
        lastName: "Reset",
        email: resetEmail,
        password: currentPassword,
        confirmPassword: currentPassword,
      },
    });
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      emailConfirmationRequired?: boolean;
      error?: string;
    } | null;

    if (!response.ok()) {
      throw new Error(
        `Reset synthetic account registration failed: ${payload?.message ?? payload?.error ?? response.status}`,
      );
    }

    if (payload?.emailConfirmationRequired) {
      const loginProbe = await page.request.post(`${syntheticBaseURL}/api/auth/login`, {
        data: {
          email: resetEmail,
          password: currentPassword,
        },
      });
      const loginProbePayload = (await loginProbe.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;

      if (!loginProbe.ok()) {
        const probeMessage = String(loginProbePayload?.message ?? loginProbePayload?.error ?? "");
        if (!/confirm your email|verify your email/i.test(probeMessage)) {
          throw new Error(
            `Unexpected login response after registration: ${probeMessage || loginProbe.status}`,
          );
        }

        const confirmUrl = await getSyntheticTokenLink(page, "confirm");
        await page.goto(confirmUrl);
        await expect(
          page.getByText("Email confirmed. You can now log in."),
          "confirmation success state did not render",
        ).toBeVisible();
      }
    }

    logSyntheticStep("account.seed.complete", { resetEmail }, passwordResetPublicJourneysSuiteKey);
  }

  async function loginWithPassword(page: Page, password: string) {
    await openLogin(page);
    await page.getByLabel("Email").fill(resetEmail);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/(awaiting-access|baseline|first-run|onboarding\/profile)/, {
      timeout: 20_000,
    });
  }

  test("reset request initiation works", async ({ page }) => {
    await ensureTestAccount(page);
    await openLogin(page);

    logSyntheticStep("reset.request.start", { resetEmail }, passwordResetPublicJourneysSuiteKey);
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(
      page.getByRole("heading", { name: "Forgot password" }),
      "forgot password form did not render",
    ).toBeVisible();
    await page.getByLabel("Email").fill(resetEmail);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      page.getByText("If an account exists, a reset link has been sent."),
      "reset request success state did not render",
    ).toBeVisible();
    logSyntheticStep("reset.request.complete", { resetEmail }, passwordResetPublicJourneysSuiteKey);
  });

  test("reset email retrieval and link validation work", async ({ page }) => {
    await openLogin(page);
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.getByLabel("Email").fill(resetEmail);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If an account exists, a reset link has been sent.")).toBeVisible();

    logSyntheticStep("reset.link.start", { resetEmail }, passwordResetPublicJourneysSuiteKey);
    const resetUrl = await getSyntheticTokenLink(page, "reset-password");
    await page.goto(resetUrl);
    await expect(
      page.getByRole("heading", { name: "Reset password" }),
      "reset password form did not render",
    ).toBeVisible();
    await expect(page.getByLabel("New password"), "reset password field missing").toBeVisible();
    await expect(page.getByLabel("Confirm password"), "confirm password field missing").toBeVisible();
    logSyntheticStep("reset.link.complete", { resetEmail, linkRetrieved: true }, passwordResetPublicJourneysSuiteKey);
  });

  test("password reset succeeds and authenticates the user", async ({ page }) => {
    await openLogin(page);
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.getByLabel("Email").fill(resetEmail);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If an account exists, a reset link has been sent.")).toBeVisible();

    const resetUrl = await getSyntheticTokenLink(page, "reset-password");
    logSyntheticStep("reset.apply.start", { resetEmail }, passwordResetPublicJourneysSuiteKey);
    await page.goto(resetUrl);
    await page.getByLabel("New password").fill(nextPassword);
    await page.getByLabel("Confirm password").fill(nextPassword);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(
      page.getByText("Password reset successfully. You can now log in."),
      "password reset success state did not render",
    ).toBeVisible();
    await page.waitForURL(/\/auth\/login/, { timeout: 20_000 });

    await loginWithPassword(page, nextPassword);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Go to App" }), "authenticated handoff did not render").toBeVisible();
    await page.getByRole("link", { name: "Go to App" }).click();
    await expect
      .poll(async () => new URL(page.url()).pathname, {
        timeout: 20_000,
      })
      .toMatch(/^(\/awaiting-access|\/baseline|\/first-run|\/onboarding\/profile)$/);

    const authPathname = new URL(page.url()).pathname;
    if (!["/awaiting-access", "/baseline", "/first-run", "/onboarding/profile"].includes(authPathname)) {
      throw new Error(`password reset login did not route to an authenticated destination: ${authPathname}`);
    }

    logSyntheticStep(
      "reset.apply.complete",
      { resetEmail, authPathname },
      passwordResetPublicJourneysSuiteKey,
    );
  });

  test("new password login and authenticated continuity work", async ({ page }) => {
    await openLogin(page);
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.getByLabel("Email").fill(resetEmail);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If an account exists, a reset link has been sent.")).toBeVisible();

    const resetUrl = await getSyntheticTokenLink(page, "reset-password");
    await page.goto(resetUrl);
    await page.getByLabel("New password").fill(nextPassword);
    await page.getByLabel("Confirm password").fill(nextPassword);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("Password reset successfully. You can now log in.")).toBeVisible();
    await page.waitForURL(/\/auth\/login/, { timeout: 20_000 });

    logSyntheticStep("login.new-password.start", { resetEmail }, passwordResetPublicJourneysSuiteKey);
    await loginWithPassword(page, nextPassword);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Go to App" }), "post-login continuation did not render").toBeVisible();
    logSyntheticStep("login.new-password.complete", { resetEmail, pathname: new URL(page.url()).pathname }, passwordResetPublicJourneysSuiteKey);
  });

  test("old password is rejected after reset", async ({ page }) => {
    await openLogin(page);
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.getByLabel("Email").fill(resetEmail);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If an account exists, a reset link has been sent.")).toBeVisible();

    const resetUrl = await getSyntheticTokenLink(page, "reset-password");
    await page.goto(resetUrl);
    await page.getByLabel("New password").fill(nextPassword);
    await page.getByLabel("Confirm password").fill(nextPassword);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("Password reset successfully. You can now log in.")).toBeVisible();

    logSyntheticStep("login.old-password.start", { resetEmail }, passwordResetPublicJourneysSuiteKey);
    await page.goto("/auth/login");
    await page.getByLabel("Email").fill(resetEmail);
    await page.getByLabel("Password").fill(currentPassword);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Log in" }).click();
    const response = await responsePromise;
    expect(response.ok(), `old password unexpectedly still worked: ${response.status()} ${response.url()}`).toBeFalsy();
    await expect(
      page.getByText(/invalid credentials|login failed/i),
      "old password rejection message did not render",
    ).toBeVisible();
    logSyntheticStep("login.old-password.complete", { resetEmail, status: response.status() }, passwordResetPublicJourneysSuiteKey);
  });

  test("reset link reuse fails cleanly", async ({ page }) => {
    await openLogin(page);
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.getByLabel("Email").fill(resetEmail);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If an account exists, a reset link has been sent.")).toBeVisible();

    const resetUrl = await getSyntheticTokenLink(page, "reset-password");
    await page.goto(resetUrl);
    await page.getByLabel("New password").fill(nextPassword);
    await page.getByLabel("Confirm password").fill(nextPassword);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("Password reset successfully. You can now log in.")).toBeVisible();

    logSyntheticStep("reset.reuse.start", { resetEmail }, passwordResetPublicJourneysSuiteKey);
    await page.goto(resetUrl);
    await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
    await page.getByLabel("New password").fill(nextPassword);
    await page.getByLabel("Confirm password").fill(nextPassword);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(
      page.getByText(/invalid or expired reset token/i),
      "reused reset link did not fail cleanly",
    ).toBeVisible();
    logSyntheticStep("reset.reuse.complete", { resetEmail }, passwordResetPublicJourneysSuiteKey);
  });
});
