import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { TopNavAccountArea } from "@/src/components/layout/TopNavAccountArea";
import { EntitlementsProvider } from "@/src/lib/entitlements";
import { sanitizeReturnPath } from "@/src/lib/safe-redirect";
import {
  mockPathname,
  mockRouterPush,
  overrideSearchParams,
  setFetchImplementation,
} from "@/tests/setup";

const createResponse = (body: unknown, ok = true, status = ok ? 200 : 401) => ({
  ok,
  status,
  json: () => Promise.resolve(body),
});

function renderTopNav() {
  return render(
    <EntitlementsProvider entitlements={null}>
      <TopNavAccountArea />
    </EntitlementsProvider>,
  );
}

describe("TopNavAccountArea", () => {
  it("shows Sign in when unauthenticated", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/users/me")) {
        return createResponse({ error: "Unauthorized" }, false, 401);
      }
      return createResponse({});
    });

    renderTopNav();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    });

    expect(screen.queryByText("user@example.com")).toBeNull();
    expect(screen.queryByLabelText("Account menu")).toBeNull();
  });

  it("shows a single Settings trigger when authenticated", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/users/me")) {
        return createResponse({ email: "user@example.com" }, true, 200);
      }
      return createResponse({});
    });

    renderTopNav();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    });

    expect(screen.queryByText("Log out")).toBeNull();
    expect(screen.queryByLabelText("Account menu")).toBeNull();

    const menuButton = screen.getByRole("button", { name: "Settings" });
    fireEvent.click(menuButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open Settings" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
      expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });
  });

  it("starts the auth flow when Sign in is clicked", async () => {
    mockPathname.mockReturnValue("/jobs/search");
    overrideSearchParams({ page: "3" });

    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/users/me")) {
        return createResponse({ error: "Unauthorized" }, false, 401);
      }
      return createResponse({});
    });

    renderTopNav();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/auth/login?next=%2Fjobs%2Fsearch%3Fpage%3D3");
    });
  });

  it("logs out and routes to login when Logout is clicked from the menu", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/users/me")) {
        return createResponse({ email: "user@example.com" }, true, 200);
      }

      if (url.includes("/api/auth/logout")) {
        return createResponse({}, true, 200);
      }

      return createResponse({});
    });
    setFetchImplementation(fetchMock);

    renderTopNav();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/auth/login");
    });

    const hadLogoutCall = fetchMock.mock.calls.some(([input, init]) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      return url.includes("/api/auth/logout") && init?.method === "POST";
    });
    expect(hadLogoutCall).toBe(true);
  });

  it("opens and closes settings modal from the menu", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/users/me")) {
        return createResponse({ email: "user@example.com" }, true, 200);
      }
      return createResponse({});
    });

    renderTopNav();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Settings" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Close" }).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Auto generate threshold")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    });
  });
});

describe("sanitizeReturnPath", () => {
  it("preserves valid internal paths", () => {
    expect(sanitizeReturnPath("/baseline?tab=all")).toBe("/baseline?tab=all");
  });

  it("rejects external URLs or malformed callbacks", () => {
    expect(sanitizeReturnPath("https://malicious.com")).toBeNull();
    expect(sanitizeReturnPath("//other-host")).toBeNull();
  });
});

