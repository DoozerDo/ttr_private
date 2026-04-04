// apps/web/app/ui/InstrumentPanelShell.tsx
"use client";

import type { CSSProperties, ReactNode } from "react";
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
  containerClassName?: string;
  containerStyle?: CSSProperties;
  contentWidth?: "default" | "wide";
};

export function InstrumentPanelShell({
  kicker,
  title,
  subtitle,
  rightSlot,
  children,
  backHref,
  backLabel,
  containerClassName,
  containerStyle,
  contentWidth = "default",
}: InstrumentPanelShellProps) {
  const baseContainerStyle = { ...ttrLayout.container };
  if (contentWidth === "wide") {
    baseContainerStyle.maxWidth = 1800;
    baseContainerStyle.padding = "0";
  }
  const mergedContainerStyle = containerStyle
    ? { ...baseContainerStyle, ...containerStyle }
    : baseContainerStyle;
  const widthClassName =
    contentWidth === "wide"
      ? "w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8"
      : "";
  const combinedClassName = [widthClassName, containerClassName]
    .filter(Boolean)
    .join(" ");
  return (
    <main style={ttrLayout.shell}>
      <div
        style={mergedContainerStyle}
        className={combinedClassName ? combinedClassName : undefined}
      >
        <header style={ttrComponents.headerCard}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
                  <span aria-hidden="true">&lt;</span>
                  <span>{backLabel || "Back"}</span>
                </Link>
              ) : null}
            </div>

            {kicker ? <span style={ttrTypography.kicker}>{kicker}</span> : null}

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h1 style={ttrTypography.h1}>{title}</h1>
              {subtitle ? <p style={ttrTypography.paragraph}>{subtitle}</p> : null}
            </div>
          </div>

          {rightSlot ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{rightSlot}</div>
          ) : null}
        </header>

        <div style={{ marginTop: 16 }}>
          <section style={{ flex: 1, minWidth: 0 }}>{children}</section>
        </div>
      </div>
    </main>
  );
}
