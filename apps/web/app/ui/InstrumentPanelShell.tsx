// apps/web/app/ui/InstrumentPanelShell.tsx
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ttrComponents, ttrLayout, ttrTypography } from "./ttrStyles";

type InstrumentPanelShellProps = {
  kicker?: string;
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
};

export function InstrumentPanelShell({
  kicker,
  title,
  subtitle,
  rightSlot,
  children,
  backHref,
  backLabel,
}: InstrumentPanelShellProps) {
  return (
    <main style={ttrLayout.shell}>
      <div style={ttrLayout.container}>
        <header style={ttrComponents.headerCard}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {backHref ? (
              <Link
                href={backHref}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  width: "fit-content",
                  textDecoration: "none",
                  color: "rgba(226,232,240,0.8)",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                <span aria-hidden="true">←</span>
                <span>{backLabel || "Back"}</span>
              </Link>
            ) : null}

            {kicker ? <span style={ttrTypography.kicker}>{kicker}</span> : null}

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h1 style={ttrTypography.h1}>{title}</h1>
              {subtitle ? <p style={ttrTypography.paragraph}>{subtitle}</p> : null}
            </div>
          </div>

          {rightSlot ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {rightSlot}
            </div>
          ) : null}
        </header>

        {children}
      </div>
    </main>
  );
}

