import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PAGE_PATH = "@/app/(app)/beta/page";

async function renderPageWithDiscord(discordUrl?: string) {
  cleanup();
  vi.resetModules();

  if (discordUrl === undefined) {
    delete process.env.NEXT_PUBLIC_BETA_DISCORD_URL;
  } else {
    process.env.NEXT_PUBLIC_BETA_DISCORD_URL = discordUrl;
  }

  const mod = await import(PAGE_PATH);
  const BetaPage = mod.default;
  render(<BetaPage />);
}

describe("/beta page", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_BETA_DISCORD_URL;
  });

  it("renders core sections and bug template", async () => {
    await renderPageWithDiscord("https://discord.gg/target-this-role");

    expect(screen.getByRole("heading", { name: "Beta Testing Guide" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What this beta is for" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How to test" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What to look for" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How to report a bug" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Beta expectations" })).toBeInTheDocument();
    expect(screen.getByText(/Bug Title:/)).toBeInTheDocument();
    expect(screen.getByText(/Job Description used:/)).toBeInTheDocument();
  });

  it("points Start Testing CTAs to /analyze", async () => {
    await renderPageWithDiscord("https://discord.gg/target-this-role");

    const links = screen.getAllByRole("link", { name: "Start Testing" });
    expect(links.length).toBe(2);
    links.forEach((link) => {
      expect(link).toHaveAttribute("href", "/analyze");
    });
  });

  it("uses NEXT_PUBLIC_BETA_DISCORD_URL for Discord CTA when configured", async () => {
    await renderPageWithDiscord("https://discord.gg/ttr-beta");

    const discordLinks = screen.getAllByRole("link", { name: "Join Discord Support" });
    expect(discordLinks.length).toBeGreaterThan(0);
    discordLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "https://discord.gg/ttr-beta");
      expect(link).toHaveAttribute("target", "_blank");
    });
  });

  it("shows graceful fallback when Discord env var is missing", async () => {
    await renderPageWithDiscord(undefined);

    expect(screen.queryAllByRole("link", { name: "Join Discord Support" })).toHaveLength(0);
    expect(screen.getAllByText("Join Discord Support").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Discord support link is not configured yet.").length).toBeGreaterThan(0);
  });
});
