// apps/web/app/ui/InstrumentShell.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { InstrumentPanelShell } from "./InstrumentPanelShell";
import { ttrLayout, ttrComponents, ttrTypography } from "./ttrStyles";

type InstrumentShellProps = {
  kicker: string;
  title: string;
  rightSlot?: ReactNode;
  children: ReactNode;
};

const NAV_ITEMS = [
  { label: "Baseline", href: "/baseline" },
  { label: "Analyze", href: "/analyze" },
  { label: "Calibrate", href: "/calibrate" },
  { label: "Results", href: "/results" },
];

export function InstrumentShell({
  kicker,
  title,
  rightSlot,
  children,
}: InstrumentShellProps) {
  const pathname = usePathname();

  return (
    <main style={ttrLayout.pageShell}>
      <div style={ttrLayout.pageContainer}>
        {/* Top navigation */}
        <nav
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  ...ttrComponents.quietButton,
                  opacity: active ? 1 : 0.6,
                  border: active
                    ? "1px solid rgba(251,191,36,0.45)"
                    : "1px solid rgba(255,255,255,0.12)",
                  background: active
                    ? "rgba(251,191,36,0.12)"
                    : "rgba(255,255,255,0.05)",
                  color: active
                    ? "rgba(251,191,36,0.95)"
                    : "rgba(241,245,249,0.85)",
                  cursor: active ? "default" : "pointer",
                  pointerEvents: active ? "none" : "auto",
                }}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <InstrumentPanelShell kicker={kicker} title={title} rightSlot={rightSlot}>
          {children}
        </InstrumentPanelShell>
      </div>
    </main>
  );
}


