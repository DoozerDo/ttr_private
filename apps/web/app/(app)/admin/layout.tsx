import type { ReactNode } from "react";
import Link from "next/link";

import {
  getFileStalenessHygieneStatus,
  readPersistedFileStalenessAuditSnapshot,
} from "@/src/lib/fileStalenessAudit";

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
  { href: "/admin/synthetics", label: "Synthetic Reliability" },
  { href: "/admin/file-staleness-audit", label: "File Staleness Audit" },
  { href: "/admin/dead-code-review", label: "Dead Code Review" },
  { href: "/admin/route-drift-review", label: "Route Drift Review" },
];

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const snapshot = await readPersistedFileStalenessAuditSnapshot();
  const hygieneStatus = getFileStalenessHygieneStatus(snapshot);
  const showOverdueBanner = hygieneStatus.reminderStatus === "overdue";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {showOverdueBanner ? (
        <div className="border-b border-amber-400/20 bg-amber-400/10 px-6 py-3 text-sm text-amber-100">
          Repo hygiene overdue. Review stale and cold files.
        </div>
      ) : null}
      <div className="flex min-h-screen">
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
    </div>
  );
}

