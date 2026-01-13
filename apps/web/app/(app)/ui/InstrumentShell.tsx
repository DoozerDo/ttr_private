"use client";

import { ReactNode } from "react";

import { InstrumentPanelShell } from "./InstrumentPanelShell";
import { ttrLayout } from "./ttrStyles";

type InstrumentShellProps = {
  children: ReactNode;
  kicker?: string;
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
};

export function InstrumentShell({
  children,
  kicker,
  title,
  subtitle,
  rightSlot,
}: InstrumentShellProps) {
  return (
    <main style={ttrLayout.pageShell}>
      <div style={ttrLayout.pageContainer}>
        <InstrumentPanelShell
          kicker={kicker}
          title={title}
          subtitle={subtitle}
          rightSlot={rightSlot}
        >
          {children}
        </InstrumentPanelShell>
      </div>
    </main>
  );
}
