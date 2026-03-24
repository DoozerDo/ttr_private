"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { FormButton } from "@/components/FormButton";

type OpportunityItem = {
  id: string;
  jobId: string | null;
  analysisId: string | null;
  baselineId: string | null;
  score: number;
  company: string;
  roleTitle: string;
  status: "saved" | "ready_to_apply" | "applied" | "improving_fit" | "passed";
  updatedAt: string;
};

const STATUS_OPTIONS: Array<OpportunityItem["status"] | "all"> = [
  "all",
  "saved",
  "ready_to_apply",
  "improving_fit",
  "applied",
  "passed",
];

export default function OpportunitiesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<OpportunityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("all");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (minScore.trim()) params.set("minScore", minScore.trim());
    if (maxScore.trim()) params.set("maxScore", maxScore.trim());
    return params.toString();
  }, [statusFilter, minScore, maxScore]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/opportunities${query ? `?${query}` : ""}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Unable to load opportunities.");
        }
        const payload = (await response.json()) as OpportunityItem[];
        if (!cancelled) {
          setRows(Array.isArray(payload) ? payload : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load opportunities.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const updateStatus = async (id: string, status: OpportunityItem["status"]) => {
    setUpdatingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/opportunities/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error("Unable to update opportunity status.");
      }
      setRows((current) =>
        current.map((row) =>
          row.id === id
            ? { ...row, status, updatedAt: new Date().toISOString() }
            : row,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update opportunity status.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <PageShell>
      <div className="space-y-4">
        <PageHeader
          title="Opportunities"
          description="Track analyzed roles and continue from Results or Studio."
        />

        <section className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Status</span>
            <select
              className="rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2 text-slate-100"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as (typeof STATUS_OPTIONS)[number])
              }
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Min score</span>
            <input
              className="rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2 text-slate-100"
              value={minScore}
              onChange={(event) => setMinScore(event.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Max score</span>
            <input
              className="rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2 text-slate-100"
              value={maxScore}
              onChange={(event) => setMaxScore(event.target.value)}
              inputMode="numeric"
            />
          </label>
        </section>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {loading ? <p className="text-sm text-slate-300">Loading opportunities…</p> : null}

        {!loading ? (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-slate-950/70 text-left text-slate-300">
                <tr>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Last updated</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-white/[0.02] text-slate-100">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer hover:bg-white/[0.04]"
                    onClick={() =>
                      row.analysisId
                        ? router.push(`/results?assessmentId=${encodeURIComponent(row.analysisId)}`)
                        : undefined
                    }
                  >
                    <td className="px-3 py-2">{row.company}</td>
                    <td className="px-3 py-2">{row.roleTitle}</td>
                    <td className="px-3 py-2">{row.score}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{new Date(row.updatedAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                        <FormButton
                          variant="secondary"
                          onClick={() =>
                            row.analysisId
                              ? router.push(`/results?assessmentId=${encodeURIComponent(row.analysisId)}`)
                              : undefined
                          }
                        >
                          Open Results
                        </FormButton>
                        <FormButton
                          variant="secondary"
                          onClick={() => {
                            if (!row.analysisId) return;
                            const params = new URLSearchParams({ analysisId: row.analysisId });
                            if (row.baselineId) params.set("baselineId", row.baselineId);
                            if (row.jobId) params.set("jobId", row.jobId);
                            router.push(`/studio?${params.toString()}`);
                          }}
                        >
                          Open Studio
                        </FormButton>
                        <FormButton
                          variant="ghost"
                          disabled={updatingId === row.id}
                          onClick={() => void updateStatus(row.id, "applied")}
                        >
                          Mark Applied
                        </FormButton>
                        <FormButton
                          variant="ghost"
                          disabled={updatingId === row.id}
                          onClick={() => void updateStatus(row.id, "passed")}
                        >
                          Mark Passed
                        </FormButton>
                      </div>
                    </td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td className="px-3 py-6 text-slate-300" colSpan={6}>
                      No opportunities yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}

