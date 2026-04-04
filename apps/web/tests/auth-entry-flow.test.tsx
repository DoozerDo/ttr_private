import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccessCodeForm } from "@/app/(public)/auth/access-code/access-code-form";
import { AuthForm } from "@/app/(public)/auth/_components/auth-form";
import AwaitingAccessPage from "@/app/(public)/awaiting-access/page";
import { mockRouterPush, mockRouterReplace, setFetchImplementation } from "@/tests/setup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("auth entry flow", () => {
  it("routes login users who need access code into redemption with a clean next path", async () => {
    setFetchImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/login")) {
        return jsonResponse({ code: "ACCESS_CODE_REQUIRED", message: "access code required" }, 403);
      }
      return jsonResponse({}, 200);
    });

    render(<AuthForm mode="login" returnPath="/baseline" />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith(
        "/redeem?email=user%40example.com&next=%2Fbaseline",
      );
    });
    expect(
      screen.getByText("This beta invite still needs a code. Redeem access to continue."),
    ).toBeInTheDocument();
  });

  it("registers a beta user and sends them to awaiting access with the first-run destination", async () => {
    setFetchImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/register")) {
        return jsonResponse({ message: "Account created." }, 200);
      }
      return jsonResponse({}, 200);
    });

    render(<AuthForm mode="register" returnPath="/baseline" />);

    fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lovelace" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith(
        "/awaiting-access?email=ada%40example.com&next=%2Fbaseline",
      );
    });
  });

  it("redeems access cleanly and lands in baseline or onboarding as needed", async () => {
    setFetchImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/redeem-access-code-and-login")) {
        return jsonResponse({ ok: true }, 200);
      }
      if (url.includes("/api/users/me")) {
        return jsonResponse({
          email: "user@example.com",
          profileCompletedAt: "2025-03-01T00:00:00.000Z",
          roleTitle: "Director of Support",
          intendedUse: "beta",
        });
      }
      return jsonResponse({}, 200);
    });

    render(<AccessCodeForm initialEmail="user@example.com" initialCode="beta-123" returnPath="/baseline" />);

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Redeem access and continue" }));

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith("/baseline");
    });
  });

  it("shows the awaiting-access handoff as a normal invite step", async () => {
    const page = await AwaitingAccessPage({
      searchParams: Promise.resolve({ email: "user@example.com", next: "/baseline" }),
    });
    render(page);

    expect(screen.getByRole("heading", { name: "Your beta account is ready" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Redeem access code" })).toHaveAttribute(
      "href",
      "/redeem?email=user%40example.com&next=%2Fbaseline",
    );
  });
});
