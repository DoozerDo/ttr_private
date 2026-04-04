"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

type OverflowMenuProps = {
  onArchive: () => Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
};

export function OverflowMenu({
  onArchive,
  loading = false,
  disabled = false,
  ariaLabel,
}: OverflowMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disabled || loading) return;
    setIsOpen((prev) => !prev);
  };

  const handleArchiveClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsOpen(false);
    await onArchive();
  };

  return (
    <div ref={containerRef} className="relative flex shrink-0">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-900/70 text-slate-300 transition hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={ariaLabel ?? "Overflow actions"}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={handleToggle}
        disabled={disabled || loading}
      >
        <svg
          width="6"
          height="20"
          viewBox="0 0 6 20"
          fill="currentColor"
          role="presentation"
          aria-hidden="true"
        >
          <circle cx="3" cy="3" r="1.2" />
          <circle cx="3" cy="10" r="1.2" />
          <circle cx="3" cy="17" r="1.2" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-20 mt-2 w-32 rounded-2xl border border-white/10 bg-slate-950/95 shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
          <button
            type="button"
            className="w-full rounded-2xl px-3 py-2 text-left text-xs font-semibold text-slate-100 transition hover:bg-slate-900/40 disabled:opacity-50"
            onClick={handleArchiveClick}
            disabled={loading}
          >
            Archive
          </button>
        </div>
      )}
    </div>
  );
}
