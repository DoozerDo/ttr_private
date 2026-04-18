import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

import { buildSyntheticLoginEmail, syntheticUserPassword } from "./synthetic-config";

test.describe("baseline archive synthetic transaction", () => {
  test("non-current baseline shows Archive and can be archived", async ({ page }) => {
    const email = buildSyntheticLoginEmail();

    const registerResponse = await page.request.post("/api/auth/register", {
      data: {
        firstName: "Synthetic",
        lastName: "Baseline",
        email,
        password: syntheticUserPassword,
        confirmPassword: syntheticUserPassword,
      },
    });
    expect(registerResponse.ok(), `registration failed: ${registerResponse.status()}`).toBeTruthy();

    await page.goto("/auth/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(syntheticUserPassword);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/(awaiting-access|baseline|first-run|onboarding\/profile)/, { timeout: 20_000 });

    const pathnameAfterLogin = new URL(page.url()).pathname;
    if (pathnameAfterLogin === "/awaiting-access") {
      const accessCode = (process.env.SYNTHETIC_ACCESS_CODE || "").trim();
      test.skip(
        !accessCode,
        "Access-code gating is enabled; set SYNTHETIC_ACCESS_CODE to run baseline archive e2e locally.",
      );

      const redeemResponse = await page.request.post("/api/auth/redeem-access-code-and-login", {
        data: {
          email,
          password: syntheticUserPassword,
          code: accessCode,
        },
      });
      expect(redeemResponse.ok(), `access code redeem failed: ${redeemResponse.status()}`).toBeTruthy();
    }

    await page.goto("/baseline");

    const rendererRoot = page.locator('[data-baseline-renderer="studio-home"]');
    await expect(rendererRoot, "baseline renderer root missing (stale deploy or wrong route)").toBeVisible();
    await expect(rendererRoot, "baseline build marker missing (stale deploy)").toHaveAttribute(
      "data-baseline-build",
      "archive-e2e-v1",
    );
    await expect(rendererRoot, "baseline should be editable for a logged in user").toHaveAttribute(
      "data-baseline-mode",
      "editable",
    );

    const resume1 = resolve(process.cwd(), "tests", "fixtures", "public-landing", "synthetic-resume.pdf");
    const resume2 = resolve(process.cwd(), "tests", "fixtures", "public-landing", "synthetic-resume-2.pdf");

    await page.getByTestId("baseline-upload-input").setInputFiles(resume1);
    await expect(page.getByTestId("baseline-current-section"), "current baseline section never rendered").toBeVisible();
    await expect(page.getByText("synthetic-resume.pdf"), "first uploaded baseline filename missing").toBeVisible();

    await page.getByTestId("baseline-upload-input").setInputFiles(resume2);
    await expect(page.getByText("synthetic-resume-2.pdf"), "second uploaded baseline filename missing").toBeVisible();

    const librarySection = page.getByTestId("baseline-library-section");
    await expect(librarySection, "baseline library section missing after second upload").toBeVisible();

    const libraryCards = librarySection.locator('[data-testid^="baseline-library-card:"]');
    await expect(libraryCards, "no library cards rendered for non-current baselines").toHaveCount(1);

    const libraryCard = libraryCards.first();
    await expect(libraryCard, "library card must have archive enabled").toHaveAttribute("data-archive-enabled", "true");

    const archiveButton = libraryCard.getByRole("button", { name: "Archive" });
    await expect(archiveButton, "Archive button not visible on non-current baseline card").toBeVisible();
    await expect(archiveButton, "Archive button should be enabled on non-current baseline").toBeEnabled();

    await archiveButton.click();
    await expect(librarySection.locator('[data-testid^="baseline-library-card:"]'), "archived baseline did not disappear")
      .toHaveCount(0);
  });
});
