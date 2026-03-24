"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { BETA_GUIDE_DISMISS_KEY } from "@/lib/beta-templates";

export function BetaGuideNudge() {
  const pathname = usePathname() ?? "/";
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storage = window.localStorage as
      | { getItem?: (key: string) => string | null }
      | undefined;
    const isDismissed = storage?.getItem?.(BETA_GUIDE_DISMISS_KEY) === "true";
    setDismissed(isDismissed);
  }, []);

  if (pathname.startsWith("/beta") || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      const storage = window.localStorage as
        | { setItem?: (key: string, value: string) => void }
        | undefined;
      storage?.setItem?.(BETA_GUIDE_DISMISS_KEY, "true");
    }
    setDismissed(true);
  };

  return (
    <section
      aria-label="Beta guide prompt"
      className="mb-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 sm:p-5"
      data-testid="beta-guide-nudge"
    >
      <h2 className="text-base font-semibold text-[var(--text-primary)]">Before you start</h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Read the Beta Testing Guide before using the product. It explains how to test, what to look for, and how to report bugs.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/beta"
          className="inline-flex items-center justify-center rounded-[var(--button-radius)] border-0 bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--verdict-apply-text)] transition-colors duration-150 hover:bg-[var(--accent-primary-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          Open Beta Guide
        </Link>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-[var(--button-radius)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          onClick={handleDismiss}
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}
