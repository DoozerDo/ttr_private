"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { sanitizeReturnPath } from "@/src/lib/safe-redirect";
import { settingsRoute } from "@/src/navigation/routes";

type AuthState = "loading" | "authenticated" | "unauthenticated";

type TopNavAccountAreaProps = {
  initialEmail?: string | null;
};

export function TopNavAccountArea({ initialEmail }: TopNavAccountAreaProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [email, setEmail] = useState<string | null>(initialEmail ?? null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const currentPath = useMemo(() => {
    const serializedSearch = searchParams?.toString();
    return serializedSearch ? `${pathname}?${serializedSearch}` : pathname;
  }, [pathname, searchParams]);

  const returnPath = useMemo(() => sanitizeReturnPath(currentPath) ?? "/", [currentPath]);

  useEffect(() => {
    let canceled = false;

    const checkSession = async () => {
      try {
        const response = await fetch("/api/users/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        if (canceled) {
          return;
        }

        if (response.ok) {
          const data = await response.json().catch(() => null);
          setEmail((data as { email?: string })?.email ?? initialEmail ?? null);
          setAuthState("authenticated");
          return;
        }

        setEmail(null);
        setAuthState("unauthenticated");
      } catch {
        if (!canceled) {
          setEmail(null);
          setAuthState("unauthenticated");
        }
      }
    };

    checkSession();

    return () => {
      canceled = true;
    };
  }, [initialEmail]);

  const handleSignIn = useCallback(async () => {
    if (authState !== "unauthenticated" || isProcessing) {
      return;
    }

    setIsProcessing(true);

    try {
      await router.push(`/auth/login?next=${encodeURIComponent(returnPath)}`);
    } finally {
      setIsProcessing(false);
    }
  }, [authState, isProcessing, returnPath, router]);

  const handleLogout = useCallback(async () => {
    if (authState !== "authenticated" || isProcessing) {
      return;
    }

    setIsProcessing(true);
    setLogoutError(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { error?: string })?.error ?? "Logout failed");
      }

      setAuthState("unauthenticated");
      setEmail(null);
      setMenuOpen(false);
      await router.push("/auth/login");
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Logout failed");
    } finally {
      setIsProcessing(false);
    }
  }, [authState, isProcessing, router]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const label =
    authState === "authenticated"
      ? "Log out"
      : authState === "unauthenticated"
        ? "Sign in"
        : "Checking...";

  const onClick = authState === "authenticated" ? handleLogout : handleSignIn;

  return (
    <div className="flex items-center gap-3">
      {authState === "authenticated" && email ? (
        <span className="max-w-[160px] truncate text-sm font-semibold text-[var(--text-primary)]">
          {email}
        </span>
      ) : null}
      {authState === "authenticated" ? (
        <div className="relative z-50" ref={menuRef}>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] shadow-sm transition-colors duration-150 hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true" className="text-xs">
              ˅
            </span>
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3 shadow-xl">
              <Link
                href={settingsRoute.href}
                className="block rounded-lg px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                onClick={() => setMenuOpen(false)}
              >
                {settingsRoute.label}
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isProcessing}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--verdict-apply-text)] hover:bg-[var(--accent-primary-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                {isProcessing ? "Logging out" : "Logout"}
              </button>
              {logoutError ? (
                <p className="mt-2 text-xs text-[var(--status-danger)]">{logoutError}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onClick}
        disabled={authState === "loading" || isProcessing}
        className="rounded-full border border-[var(--border-subtle)] px-4 py-1 text-sm font-semibold text-[var(--text-primary)] transition-colors duration-150 bg-[var(--bg-elevated)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {label}
      </button>
    </div>
  );
}
