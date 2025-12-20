"use client";

import type { ReactNode } from "react";
import { ttrLayout, ttrTypography } from "./ttrStyles";

export function InstrumentPanelShell(props: {
  kicker: string;
  title: string;
  rightSlot?: ReactNode;
  children: ReactNode;
}) {
  const { kicker, title, rightSlot, children } = props;

  return (
    <main style={ttrLayout.page}>
      <div style={ttrLayout.container}>
        <div style={ttrLayout.headerBar}>
          <div style={ttrLayout.headerLeft}>
            <span style={ttrTypography.kicker}>{kicker}</span>
            <h1 style={ttrTypography.h1}>{title}</h1>
          </div>
          {rightSlot ? <div>{rightSlot}</div> : null}
        </div>

        {children}
      </div>
    </main>
  );
}
