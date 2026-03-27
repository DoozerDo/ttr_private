"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { ReportBugModal } from "./ReportBugModal";

type ReportBugContextValue = {
  open: () => void;
};

const ReportBugContext = createContext<ReportBugContextValue | null>(null);

type ReportBugProviderProps = {
  children: ReactNode;
  userId?: string | null;
};

type ReportBugTriggerProps = {
  className?: string;
  label?: string;
};

export function ReportBugProvider({ children, userId }: ReportBugProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const contextValue = useMemo(
    () => ({
      open: () => setIsOpen(true),
    }),
    [],
  );

  return (
    <ReportBugContext.Provider value={contextValue}>
      {children}
      <ReportBugModal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        userId={userId ?? undefined}
      />
    </ReportBugContext.Provider>
  );
}

export function ReportBugTrigger({ className = "", label = "Report a bug" }: ReportBugTriggerProps) {
  const context = useContext(ReportBugContext);
  if (!context) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={context.open}
      className={`rounded-full border border-white/20 bg-transparent px-4 py-2 text-xs font-semibold text-white transition hover:border-white/60 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${className}`.trim()}
    >
      {label}
    </button>
  );
}
