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
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className={`mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 ${className ?? ""}`}>
        {navItems && navItems.length ? (
          <nav className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-1 transition ${
                  item.active
                    ? "border border-amber-300 bg-amber-400/10 text-amber-200"
                    : "border border-transparent text-slate-300 hover:border-white/30"
                }`}
              >
                {item.label}
                {item.description ? (
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
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
  );
}
