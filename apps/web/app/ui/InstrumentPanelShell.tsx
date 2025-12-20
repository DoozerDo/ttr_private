// apps/web/app/ui/InstrumentPanelShell.tsx
"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

type NavItem = {
  href?: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/baseline",
    label: "Baseline",
    description: "Your source resume",
  },
  {
    href: "/analyze",
    label: "Analyze",
    description: "Run fit scoring",
  },
  {
    label: "Calibrate",
    description: "Refine signal and weighting",
    disabled: true,
  },
  {
    label: "Results",
    description: "Review match output",
    disabled: true,
  },
];

function ShellNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() || "";

  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {NAV_ITEMS.map((item) => {
        const isActive =
          !item.disabled &&
          item.href &&
          (pathname === item.href || pathname.startsWith(item.href + "/"));

        const sharedStyle = {
          borderRadius: 12,
          padding: "10px 10px",
          display: "flex",
          flexDirection: "column" as const,
          gap: 2,
        };

        if (item.disabled) {
          return (
            <div
              key={item.label}
              aria-disabled="true"
              style={{
                ...sharedStyle,
                border: "1px dashed rgba(255,255,255,0.12)",
                background: "rgba(2,6,23,0.12)",
                color: "rgba(226,232,240,0.45)",
                cursor: "not-allowed",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 900 }}>{item.label}</span>
              {item.description ? (
                <span style={{ fontSize: 12 }}>{item.description}</span>
              ) : null}
            </div>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href!}
            onClick={onNavigate}
            style={{
              ...sharedStyle,
              textDecoration: "none",
              border: isActive
                ? "1px solid rgba(148,163,184,0.35)"
                : "1px solid rgba(255,255,255,0.06)",
              background: isActive
                ? "rgba(148,163,184,0.12)"
                : "rgba(2,6,23,0.18)",
              color: "rgba(226,232,240,0.92)",
            }}
            aria-current={isActive ? "page" : undefined}
          >
            <span style={{ fontSize: 14, fontWeight: 900 }}>{item.label}</span>
            {item.description ? (
              <span style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                {item.description}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function InstrumentPanelShell({
  kicker,
  title,
  subtitle,
  rightSlot,
  children,
  backHref,
  backLabel,
}: InstrumentPanelShellProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileNavMounted, setMobileNavMounted] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsMobile(mq.matches);
    apply();

    const handler = () => apply();

    if (typeof mq.addEventListener === "function") mq.addEventListener("change", handler);
    else mq.addListener(handler);

    return () => {
      if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", handler);
      else mq.removeListener(handler);
    };
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileNavOpen(false);
      setMobileNavMounted(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (mobileNavOpen) setMobileNavMounted(true);
  }, [mobileNavOpen]);

  const closeMobileNav = () => {
    setMobileNavOpen(false);
    window.setTimeout(() => setMobileNavMounted(false), 180);
  };

  const openMobileNav = () => {
    setMobileNavMounted(true);
    setMobileNavOpen(true);
  };

  useEffect(() => {
    if (!mobileNavMounted) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobileNav();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavMounted]);

  return (
    <main style={ttrLayout.shell}>
      <div style={ttrLayout.container}>
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
                  <span aria-hidden="true">←</span>
                  <span>{backLabel || "Back"}</span>
                </Link>
              ) : null}

              {isMobile ? (
                <button
                  type="button"
                  onClick={openMobileNav}
                  style={{
                    ...ttrComponents.quietButton,
                    padding: "8px 10px",
                    fontWeight: 900,
                  }}
                >
                  <span aria-hidden="true">☰</span>
                  <span style={{ marginLeft: 8 }}>Panel</span>
                </button>
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

        <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
          {!isMobile ? (
            <aside
              style={{
                width: 260,
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 16,
                padding: 14,
                background:
                  "linear-gradient(135deg, rgba(15,23,42,0.72), rgba(30,41,59,0.55))",
                boxShadow:
                  "0 15px 45px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
                backdropFilter: "blur(10px)",
              }}
            >
              <ShellNav />
            </aside>
          ) : null}

          <section style={{ flex: 1, minWidth: 0 }}>{children}</section>
        </div>
      </div>

      {isMobile && mobileNavMounted ? (
        <div
          onClick={closeMobileNav}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.65)",
            backdropFilter: "blur(6px)",
            display: "flex",
            justifyContent: "flex-start",
            padding: 12,
            zIndex: 50,
            opacity: mobileNavOpen ? 1 : 0,
            transition: "opacity 180ms ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(360px, 92vw)",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.10)",
              background:
                "linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,41,59,0.82))",
              boxShadow:
                "0 25px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
              padding: 14,
              transform: mobileNavOpen ? "translateX(0)" : "translateX(-12px)",
              opacity: mobileNavOpen ? 1 : 0,
              transition: "transform 180ms ease, opacity 180ms ease",
            }}
          >
            <ShellNav onNavigate={closeMobileNav} />
          </div>
        </div>
      ) : null}
    </main>
  );
}




