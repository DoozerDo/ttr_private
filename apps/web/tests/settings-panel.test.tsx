import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/entitlements", () => ({
  useEntitlements: () => ({ tier: "FREE", source: "direct" }),
}));

vi.mock("@/src/components/support/ReportBugProvider", () => ({
  ReportBugTrigger: () => <button type="button">Report a bug</button>,
}));

const fetchMock = vi.fn();

describe("SettingsPanel", () => {
  beforeEach(() => {
    cleanup();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("renders profile fields and saves through the profile patch contract", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        firstName: "Ada",
        lastName: "Lovelace",
        company: "Analytical Engines",
        linkedinUrl: "https://linkedin.com/in/ada",
        roleTitle: "Founder",
        intendedUse: "Hiring",
        studioResumeFocusDefault: "Technical Depth",
      }),
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const { SettingsPanel } = await import("@/src/components/settings/SettingsPanel");
    render(<SettingsPanel />);

    expect(await screen.findByDisplayValue("Founder")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Role title"), { target: { value: "Operator" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/users/me/profile",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"roleTitle":"Operator"'),
      }),
    ));
  });

  it("shows Discord availability and bug history support actions", async () => {
    process.env.NEXT_PUBLIC_BETA_DISCORD_URL = "https://discord.gg/ttr";
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { SettingsPanel } = await import("@/src/components/settings/SettingsPanel");
    render(<SettingsPanel />);

    expect(await screen.findByRole("link", { name: "Open Discord" })).toHaveAttribute(
      "href",
      "https://discord.gg/ttr",
    );
    expect(screen.getByRole("link", { name: "Open history" })).toHaveAttribute("href", "/support/history");
    delete process.env.NEXT_PUBLIC_BETA_DISCORD_URL;
  });

  it("shows a graceful unavailable Discord state when env is missing", async () => {
    delete process.env.NEXT_PUBLIC_BETA_DISCORD_URL;
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const { SettingsPanel } = await import("@/src/components/settings/SettingsPanel");
    render(<SettingsPanel />);

    expect(await screen.findByText("Discord unavailable")).toBeInTheDocument();
  });
});
