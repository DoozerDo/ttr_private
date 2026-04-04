import Link from "next/link";
import { ReactNode } from "react";

type NavItem = {
  label: string;
  href: string;
  active?: boolean;
  description?: string;
};

type PageShellProps = {
  children: ReactNode;
  className?: string;
  navItems?: NavItem[];
};

export function PageShell({ children, className, navItems }: PageShellProps) {
  return (
    <div className="metal-frame">
      <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]">
        <div className={`mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 ${className ?? ""}`}>
          {navItems && navItems.length ? (
            <nav className="flex flex-wrap gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text-secondary)]">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full border px-3 py-1 font-semibold transition-colors duration-150 ${
                    item.active
                      ? "border-[var(--accent-primary)] bg-[var(--bg-surface)] text-[var(--accent-primary)]"
                      : "border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {item.label}
                  {item.description ? (
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--text-secondary)]">
                      {item.description}
                    </span>
                  ) : null}
                </Link>
              ))}
            </nav>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
