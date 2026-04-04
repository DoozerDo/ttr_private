import type { ReactNode } from "react";
import Link from "next/link";

type AdminLayoutProps = {
  children: ReactNode;
};

const NAV_LINKS = [
  { href: "/admin/metrics", label: "Metrics" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/baselines", label: "Baselines" },
  { href: "/admin/access-codes", label: "Access Codes" },
  { href: "/admin/user-engagement", label: "User Engagement" },
  { href: "/admin/beta-command-center", label: "Beta Command Center" },
  { href: "/admin/bug-reporting", label: "Beta Triage" },
  { href: "/admin/beta-feedback", label: "Beta Feedback" },
  { href: "/admin/bugs", label: "Bug Reports" },
  { href: "/admin/beta-friction-dashboard", label: "Beta Friction" },
  { href: "/admin/funnel-diagnostics", label: "Funnel Diagnostics" },
  { href: "/admin/product-signal", label: "Product Signal" },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-50">
      <nav className="w-48 border-r border-slate-800 bg-slate-900/70 px-4 py-6">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-slate-400">
          Admin
        </p>
        <ul className="space-y-2">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                className="block rounded-md px-3 py-2 text-sm font-medium transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
                href={link.href}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

