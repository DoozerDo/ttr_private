import { describe, expect, it } from "vitest";

import {
  BETA_WELCOME_EMAIL_SUBJECT,
  buildBetaWelcomeDmTemplate,
  buildBetaWelcomeEmailTemplate,
} from "@/lib/beta-templates";

describe("beta welcome templates", () => {
  it("builds email template with substituted placeholders and links", () => {
    const email = buildBetaWelcomeEmailTemplate({
      accessCode: "BETA-123",
      appUrl: "https://app.targetthisrole.ai/redeem",
      betaUrl: "https://app.targetthisrole.ai/beta",
      discordUrl: "https://discord.gg/ttr",
      senderName: "Founder",
    });

    expect(email.subject).toBe(BETA_WELCOME_EMAIL_SUBJECT);
    expect(email.body).toContain("BETA-123");
    expect(email.body).toContain("https://app.targetthisrole.ai/redeem");
    expect(email.body).toContain("https://app.targetthisrole.ai/beta");
    expect(email.body).toContain("https://discord.gg/ttr");
    expect(email.body).toContain("--Founder");
  });

  it("email template includes required operational sections", () => {
    const email = buildBetaWelcomeEmailTemplate({
      accessCode: "AAA",
      appUrl: "https://app.example.com",
      betaUrl: "https://app.example.com/beta",
      discordUrl: "https://discord.example.com",
      senderName: "Ops",
    });

    expect(email.body).toContain("What this product does:");
    expect(email.body).toContain("What we need from you:");
    expect(email.body).toContain("Support and bug reporting:");
    expect(email.body).toContain("This is a beta. You will hit rough edges. That is expected.");
  });

  it("builds DM template with compact required instructions and links", () => {
    const dm = buildBetaWelcomeDmTemplate({
      accessCode: "CODE-999",
      appUrl: "https://app.targetthisrole.ai",
      betaUrl: "https://app.targetthisrole.ai/beta",
      discordUrl: "https://discord.gg/ttr-beta",
    });

    expect(dm).toContain("You're in.");
    expect(dm).toContain("CODE-999");
    expect(dm).toContain("Run four JDs through the system:");
    expect(dm).toContain("- overqualified");
    expect(dm).toContain("- qualified");
    expect(dm).toContain("- reach");
    expect(dm).toContain("- stretch");
    expect(dm).toContain("https://app.targetthisrole.ai");
    expect(dm).toContain("https://app.targetthisrole.ai/beta");
    expect(dm).toContain("https://discord.gg/ttr-beta");
  });
});
