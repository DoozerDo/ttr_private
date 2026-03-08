"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { sanitizeReturnPath } from "@/src/lib/safe-redirect";
import { SettingsPanel } from "@/src/components/settings/SettingsPanel";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [settingsOpen]);

  return (
    <>
      <div className="flex items-center gap-3">
        {authState === "authenticated" ? (
          <div className="relative z-50" ref={menuRef}>
            <button
              type="button"
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              aria-label="Settings"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              Settings
            </button>

            {menuOpen ? (
              <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3 shadow-xl">
                {email ? (
                  <p className="mb-2 truncate px-2 text-xs font-medium text-[var(--text-muted-secondary)]">
                    {email}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--bg-elevated)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                  onClick={() => {
                    setSettingsOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  Open Settings
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isProcessing}
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-left text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isProcessing ? "Logging out..." : "Logout"}
                </button>
                {logoutError ? (
                  <p className="mt-2 text-xs text-[var(--status-danger)]">{logoutError}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleSignIn}
            disabled={authState === "loading" || isProcessing}
            className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {authState === "loading" ? "Checking..." : "Sign in"}
          </button>
        )}
      </div>

      {settingsOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSettingsOpen(false);
            }
          }}
        >
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto">
            <SettingsPanel onClose={() => setSettingsOpen(false)} compact />
          </div>
        </div>
      ) : null}
    </>
  );
}

