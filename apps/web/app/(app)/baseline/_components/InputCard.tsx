"use client";

import type { ReactNode } from "react";
import { ttrComponents, ttrTypography } from "../../ui/ttrStyles";

type InputCardProps = {
  kicker: string;
  title: string;
  description: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  children: ReactNode;
};

export function InputCard({
  kicker,
  title,
  description,
  primaryAction,
  secondaryAction,
  children,
}: InputCardProps) {
  return (
    <section style={ttrComponents.basePanel} className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p style={ttrTypography.subtleLabel}>{kicker}</p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 style={{ ...ttrTypography.h2, margin: 0 }}>{title}</h2>
            </div>
            <p style={{ ...ttrTypography.paragraph, margin: 0, color: "rgba(226,232,240,0.75)" }}>
              {description}
            </p>
          </div>

          {(primaryAction || secondaryAction) ? (
            <div className="flex flex-wrap items-center gap-3">
              {secondaryAction ? secondaryAction : null}
              {primaryAction ? primaryAction : null}
            </div>
          ) : null}
        </div>
        <div className="h-px bg-white/10" />
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
