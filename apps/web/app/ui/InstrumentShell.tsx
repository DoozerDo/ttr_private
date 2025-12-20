import type { ReactNode } from "react";
import { InstrumentPanelShell } from "./InstrumentPanelShell";
import { ttrLayout } from "./ttrStyles";

type InstrumentShellProps = {
  kicker: string;
  title: string;
  rightSlot?: ReactNode;
  children: ReactNode;
};

export function InstrumentShell({
  kicker,
  title,
  rightSlot,
  children,
}: InstrumentShellProps) {
  return (
    <main style={ttrLayout.pageShell}>
      <div style={ttrLayout.pageContainer}>
        <InstrumentPanelShell kicker={kicker} title={title} rightSlot={rightSlot}>
          {children}
        </InstrumentPanelShell>
      </div>
    </main>
  );
}

