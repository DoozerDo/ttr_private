"use client";

import { useEffect, useState } from "react";

type BugReportingConfig = {
  githubConfigured: boolean;
  sentryConfigured: boolean;
  projectAssignmentEnabled: boolean;
};

export default function BugReportingAdminPage() {
  const [config, setConfig] = useState<BugReportingConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchConfig = async () => {
      try {
        const response = await fetch("/api/support/config", {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Unable to load bug reporting configuration.");
        }
        const payload = (await response.json()) as BugReportingConfig;
        if (!cancelled) {
          setConfig(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load status.");
        }
      }
    };

    fetchConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  const renderStatus = (label: string, value: boolean | null) => (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
      <p className="text-xs uppercase text-slate-400">{label}</p>
      <p className="text-2xl font-semibold text-white">
        {value === null ? "Loading…" : value ? "Yes" : "No"}
      </p>
    </div>
  );

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.4em] text-slate-400">
          Support tools
        </p>
        <h1 className="text-3xl font-semibold text-slate-50">
          Bug reporting status
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          View the configuration that powers the in-app report a bug experience.
        </p>
        {error ? (
          <p className="mt-2 text-xs text-rose-300">{error}</p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {renderStatus("GitHub configured", config?.githubConfigured ?? null)}
        {renderStatus("Sentry configured", config?.sentryConfigured ?? null)}
        {renderStatus(
          "Project assignment",
          config?.projectAssignmentEnabled ?? null,
        )}
      </div>
    </section>
  );
}
