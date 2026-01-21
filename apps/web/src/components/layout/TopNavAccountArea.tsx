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
        <span className="max-w-[160px] truncate text-sm font-semibold text-slate-100">
          {email}
        </span>
      ) : null}
      {authState === "authenticated" ? (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-white/20 bg-slate-800/80 px-4 py-2 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-white/40"
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
            <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl border border-white/10 bg-slate-900/80 p-3 shadow-xl">
              <Link
                href={settingsRoute.href}
                className="block rounded-lg px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800/60"
                onClick={() => setMenuOpen(false)}
              >
                {settingsRoute.label}
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isProcessing}
                className="mt-1 w-full rounded-lg border border-transparent bg-amber-400/20 px-3 py-2 text-left text-sm font-semibold text-amber-200 transition hover:border-amber-400/60 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isProcessing ? "Logging out" : "Logout"}
              </button>
              {logoutError ? <p className="mt-2 text-xs text-red-400">{logoutError}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onClick}
        disabled={authState === "loading" || isProcessing}
        className="rounded-full border border-white/20 px-4 py-1 text-sm font-semibold text-slate-100 transition hover:bg-slate-900/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {label}
      </button>
    </div>
  );
}
