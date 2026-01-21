import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { TopNavAccountArea } from "@/src/components/layout/TopNavAccountArea";
import { sanitizeReturnPath } from "@/src/lib/safe-redirect";
import {
  mockPathname,
  mockRouterPush,
  overrideSearchParams,
  setFetchImplementation,
} from "@/tests/setup";
import { settingsRoute } from "@/src/navigation/routes";

const createResponse = (body: unknown, ok = true, status = ok ? 200 : 401) => ({
  ok,
  status,
  json: () => Promise.resolve(body),
});

describe("TopNavAccountArea", () => {
  it("shows Sign in when unauthenticated", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/users/me")) {
        return createResponse({ error: "Unauthorized" }, false, 401);
      }
      return createResponse({});
    });

    render(<TopNavAccountArea />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    });

    expect(screen.queryByText("user@example.com")).toBeNull();
    expect(screen.queryByLabelText("Account menu")).toBeNull();
  });

  it("shows email, dropdown, and Log out when authenticated", async () => {
    setFetchImplementation(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/users/me")) {
        return createResponse({ email: "user@example.com" }, true, 200);
      }
      return createResponse({});
    });

    render(<TopNavAccountArea />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    });

    const emails = screen.getAllByText("user@example.com");
    expect(emails).toHaveLength(1);
    expect(emails[0]).toBeInTheDocument();
    const menuButton = screen.getByLabelText("Account menu");
    fireEvent.click(menuButton);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: settingsRoute.label })).toBeInTheDocument();
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

    render(<TopNavAccountArea />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/auth/login?next=%2Fjobs%2Fsearch%3Fpage%3D3");
    });
  });

  it("logs out and routes to login when Log out is clicked", async () => {
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

    render(<TopNavAccountArea />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/auth/login");
    });

    const hadLogoutCall = fetchMock.mock.calls.some(([input, init]) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      return url.includes("/api/auth/logout") && init?.method === "POST";
    });
    expect(hadLogoutCall).toBe(true);
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
