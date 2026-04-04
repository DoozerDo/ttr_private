"use client";

import { useState } from "react";

type CopyCodeButtonProps = {
  value: string;
  idleLabel?: string;
  copiedLabel?: string;
  className?: string;
};

export function CopyCodeButton({
  value,
  idleLabel = "Copy",
  copiedLabel = "Copied",
  className,
}: CopyCodeButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={
        className ??
        "rounded-md border border-emerald-300/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/20"
      }
    >
      {copied ? copiedLabel : idleLabel}
    </button>
  );
}
