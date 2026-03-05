"use client";

import type { ReactNode, CSSProperties } from "react";

import { ttrComponents, ttrTypography } from "../../ui/ttrStyles";

type SetupModuleCardProps = {
  label: string;
  title: string;
  description?: string;
  primaryAction?: ReactNode;
  footerActions?: ReactNode;
  children: ReactNode;
  className?: string;
  containerStyle?: CSSProperties;
  titleClassName?: string;
};

export function SetupModuleCard({
  label,
  title,
  description,
  primaryAction,
  footerActions,
  children,
  className,
  containerStyle,
  titleClassName,
}: SetupModuleCardProps) {
  const mergedStyle = containerStyle
    ? { ...ttrComponents.basePanel, ...containerStyle }
    : ttrComponents.basePanel;

  return (
    <section
      style={mergedStyle}
      className={[
        "flex flex-col gap-5 rounded-2xl border border-white/10 bg-slate-950/50",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <p style={ttrTypography.subtleLabel}>{label}</p>
          <h2
            style={{ ...ttrTypography.h2, margin: 0 }}
            className={titleClassName ?? undefined}
          >
            {title}
          </h2>
          {description ? (
            <p style={{ ...ttrTypography.paragraph, margin: 0, color: "rgba(226,232,240,0.7)" }}>
              {description}
            </p>
          ) : null}
        </div>

        {primaryAction ? (
          <div className="mt-3 flex shrink-0 items-center justify-end md:mt-0">
            {primaryAction}
          </div>
        ) : null}
      </header>

      <div className="space-y-4">{children}</div>

      {footerActions ? (
        <footer className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
          {footerActions}
        </footer>
      ) : null}
    </section>
  );
}
