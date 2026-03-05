"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/Alert";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { apiFetchJson, downloadBlob } from "../lib/api";

type Status =
  | "SAVED"
  | "APPLIED"
  | "RECRUITER_SCREEN"
  | "HIRING_MANAGER"
  | "LOOP"
  | "OFFER"
  | "REJECTED"
  | "WITHDRAWN"
  | "IN_FIT_REVIEW"
  | "DORMANT";
type Band = "FIT_REVIEW" | "VIABLE" | "STRONG" | "ELITE";
type SectionKey = "active" | "dormant" | "completed";
type Opportunity = {
  id: string;
  companyName: string;
  jobTitle: string;
  salary: string | null;
  dateCreated: string;
  lastStatusChange: string;
  status: Status;
  initialScore: number;
  currentScore: number;
  initialBand: Band;
  currentBand: Band;
  baselineVersionUsed: string | null;
  dormant: boolean;
  nextAction: string;
};
type Grouped = { companyName: string; opportunities: Opportunity[] };
type ActionType =
  | "viable_crossing"
  | "band_upgrade"
  | "follow_up"
  | "dormant_warning"
  | "dormant";
type ActionCard = {
  type: ActionType;
  priority: number;
  opportunityId: string;
  companyName: string;
  jobTitle: string;
  message: string;
};

type IntelligenceSort = "best_fit" | "highest_confidence" | "lowest_competition_risk" | "most_strategic";

const STATUS_LABEL: Record<Status, string> = {
  SAVED: "Saved",
  APPLIED: "Applied",
  RECRUITER_SCREEN: "Recruiter Screen",
  HIRING_MANAGER: "Hiring Manager",
  LOOP: "Loop",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  IN_FIT_REVIEW: "In Fit Review",
  DORMANT: "Dormant",
};
const BAND_LABEL: Record<Band, string> = {
  ELITE: "Elite",
  STRONG: "Strong",
  VIABLE: "Viable",
  FIT_REVIEW: "In Fit Review",
};
const ACTIVE: Status[] = [
  "SAVED",
  "APPLIED",
  "RECRUITER_SCREEN",
  "HIRING_MANAGER",
  "LOOP",
  "OFFER",
  "IN_FIT_REVIEW",
];
const COMPLETED = new Set<Status>(["REJECTED", "WITHDRAWN"]);
const BAND_RANK: Record<Band, number> = { ELITE: 0, STRONG: 1, VIABLE: 2, FIT_REVIEW: 3 };
const FORWARD: Record<Status, Status[]> = {
  SAVED: ["APPLIED"],
  APPLIED: ["RECRUITER_SCREEN"],
  RECRUITER_SCREEN: ["HIRING_MANAGER"],
  HIRING_MANAGER: ["LOOP"],
  LOOP: ["OFFER"],
  OFFER: [],
  REJECTED: [],
  WITHDRAWN: [],
  IN_FIT_REVIEW: [],
  DORMANT: [],
};
const ACTION_RANK: Record<ActionType, number> = {
  viable_crossing: 1,
  band_upgrade: 2,
  follow_up: 3,
  dormant_warning: 4,
  dormant: 5,
};
const TERMINAL_FROM_ACTIVE: Status[] = ["REJECTED", "WITHDRAWN"];

const sectionFor = (o: Opportunity): SectionKey =>
  COMPLETED.has(o.status) ? "completed" : o.status === "DORMANT" || o.dormant ? "dormant" : "active";
const fmtDate = (value: string) =>
  Number.isNaN(new Date(value).getTime()) ? value : new Date(value).toLocaleDateString();
const fit = (o: Opportunity) =>
  o.initialScore === o.currentScore ? `${o.currentScore}` : `${o.initialScore} -> ${o.currentScore}`;
const actionTitle = (t: ActionType) =>
  t === "viable_crossing"
    ? "Opportunity became viable"
    : t === "band_upgrade"
      ? "Band upgrade"
      : t === "follow_up"
        ? "Follow up recommended"
        : t === "dormant_warning"
          ? "Dormant warning"
          : "Marked dormant";
const emailDraft = (o: Opportunity) =>
  `Subject: Follow-up on ${o.jobTitle} opportunity\n\nHello [Recruiter Name],\n\nI am following up on my candidacy for the ${o.jobTitle} role at ${o.companyName}.\nI remain interested in the opportunity and would appreciate any update on timeline and next steps.\n\nThank you for your time.\n\nBest,\n[Your Name]`;

function mapApplicationConfidence(score: number): "Very High" | "High" | "Moderate" | "Low" {
  if (score >= 90) return "Very High";
  if (score >= 80) return "High";
  if (score >= 70) return "Moderate";
  return "Low";
}

function mapCompetitionRisk(score: number): "Low" | "Moderate" | "High" {
  if (score >= 85) return "Low";
  if (score >= 70) return "Moderate";
  return "High";
}

function inferSignalsFromRoleTitle(roleTitle: string) {
  const normalized = roleTitle.toLowerCase();
  const strengths = [
    normalized.includes("support")
      ? "SaaS support operations"
      : "Cross-functional coordination",
    normalized.includes("incident")
      ? "Incident management leadership"
      : "Operational process leadership",
    normalized.includes("manager") || normalized.includes("lead")
      ? "Team leadership and enablement"
      : "Customer experience strategy",
  ];
  const gaps = [
    normalized.includes("hardware")
      ? "Scaled cloud operations exposure"
      : "Hardware manufacturing exposure",
    normalized.includes("enterprise")
      ? "Global enterprise stakeholder depth"
      : "Enterprise-scale transformation examples",
  ];
  return {
    strengths: Array.from(new Set(strengths)).slice(0, 3),
    gaps: Array.from(new Set(gaps)).slice(0, 2),
  };
}

export default function OpportunitiesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const refs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [grouped, setGrouped] = useState<Grouped[]>([]);
  const [actions, setActions] = useState<ActionCard[]>([]);
  const [actionsOpen, setActionsOpen] = useState(true);
  const [dormantOpen, setDormantOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState<Record<string, boolean>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [resetTarget, setResetTarget] = useState<Opportunity | null>(null);
  const [dormantTarget, setDormantTarget] = useState<Opportunity | null>(null);
  const [draftTarget, setDraftTarget] = useState<Opportunity | null>(null);
  const [sortBy, setSortBy] = useState<IntelligenceSort>("best_fit");

  const opportunities = useMemo(
    () =>
      grouped.flatMap((g) => g.opportunities ?? []).sort((a, b) => {
        const sa = sectionFor(a);
        const sb = sectionFor(b);
        const pa = sa === "active" ? BAND_RANK[a.currentBand] : sa === "dormant" ? 4 : 5;
        const pb = sb === "active" ? BAND_RANK[b.currentBand] : sb === "dormant" ? 4 : 5;
        if (pa !== pb) return pa - pb;
        if (a.currentScore !== b.currentScore) return b.currentScore - a.currentScore;
        return new Date(b.lastStatusChange).getTime() - new Date(a.lastStatusChange).getTime();
      }),
    [grouped],
  );
  const byId = useMemo(() => new Map(opportunities.map((o) => [o.id, o])), [opportunities]);
  const dedupActions = useMemo(() => {
    const sorted = [...actions].sort(
      (a, b) => ACTION_RANK[a.type] - ACTION_RANK[b.type] || a.companyName.localeCompare(b.companyName),
    );
    const map = new Map<string, ActionCard>();
    sorted.forEach((c) => {
      if (!map.has(c.opportunityId)) map.set(c.opportunityId, c);
    });
    return Array.from(map.values()).slice(0, 5);
  }, [actions]);

  const sectionRows = useMemo(() => {
    const active = opportunities.filter((o) => sectionFor(o) === "active");
    const dormant = opportunities.filter((o) => sectionFor(o) === "dormant");
    const completed = opportunities.filter((o) => sectionFor(o) === "completed");
    return { active, dormant, completed };
  }, [opportunities]);

  const intelligenceSummary = useMemo(() => {
    const jobsAnalyzed = opportunities.length;
    const strongTargets = opportunities.filter((o) => o.currentScore >= 85).length;
    const possibleTargets = opportunities.filter(
      (o) => o.currentScore >= 70 && o.currentScore < 85,
    ).length;
    const lowProbability = opportunities.filter((o) => o.currentScore < 70).length;
    return { jobsAnalyzed, strongTargets, possibleTargets, lowProbability };
  }, [opportunities]);

  const sortedIntelligenceRows = useMemo(() => {
    const rows = [...opportunities];
    rows.sort((a, b) => {
      if (sortBy === "highest_confidence") {
        const confA = mapApplicationConfidence(a.currentScore);
        const confB = mapApplicationConfidence(b.currentScore);
        const rank: Record<ReturnType<typeof mapApplicationConfidence>, number> = {
          "Very High": 0,
          High: 1,
          Moderate: 2,
          Low: 3,
        };
        if (rank[confA] !== rank[confB]) return rank[confA] - rank[confB];
      } else if (sortBy === "lowest_competition_risk") {
        const riskA = mapCompetitionRisk(a.currentScore);
        const riskB = mapCompetitionRisk(b.currentScore);
        const rank: Record<ReturnType<typeof mapCompetitionRisk>, number> = {
          Low: 0,
          Moderate: 1,
          High: 2,
        };
        if (rank[riskA] !== rank[riskB]) return rank[riskA] - rank[riskB];
      } else if (sortBy === "most_strategic") {
        const strategicA = a.currentScore + (a.currentBand === "ELITE" ? 8 : a.currentBand === "STRONG" ? 4 : 0);
        const strategicB = b.currentScore + (b.currentBand === "ELITE" ? 8 : b.currentBand === "STRONG" ? 4 : 0);
        if (strategicA !== strategicB) return strategicB - strategicA;
      }
      return b.currentScore - a.currentScore;
    });
    return rows;
  }, [opportunities, sortBy]);

  const groups = useMemo(() => {
    const mk = (rows: Opportunity[]) => {
      const m = new Map<string, Opportunity[]>();
      rows.forEach((o) => m.set(o.companyName, [...(m.get(o.companyName) ?? []), o]));
      return Array.from(m.entries()).map(([companyName, items]) => ({ companyName, opportunities: items }));
    };
    return {
      active: mk(sectionRows.active),
      dormant: mk(sectionRows.dormant),
      completed: mk(sectionRows.completed),
    };
  }, [sectionRows]);

  const focus = useCallback(
    (id: string) => {
      const o = byId.get(id);
      if (!o) return;
      const section = sectionFor(o);
      if (section === "dormant") setDormantOpen(true);
      if (section === "completed") setCompletedOpen(true);
      setCompanyOpen((s) => ({ ...s, [`${section}:${o.companyName}`]: true }));
      setHighlightId(id);
      window.setTimeout(() => refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    },
    [byId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [g, a] = await Promise.all([
        apiFetchJson<Grouped[]>("/api/opportunities/grouped", { method: "GET" }),
        apiFetchJson<ActionCard[]>("/api/opportunities/actions-needed", { method: "GET" }),
      ]);
      setGrouped(Array.isArray(g) ? g : []);
      setActions(Array.isArray(a) ? a : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load opportunities");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const id = params.get("focus");
    if (id && byId.has(id)) focus(id);
  }, [params, byId, focus]);

  const patchStatus = async (id: string, status: Status, manualReset = false) => {
    setPending((s) => ({ ...s, [id]: true }));
    setError("");
    setNotice("");
    try {
      await apiFetchJson(`/api/opportunities/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, manualReset }),
      });
      await load();
      setNotice(`Status updated to ${STATUS_LABEL[status]}.`);
      focus(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update status");
    } finally {
      setPending((s) => ({ ...s, [id]: false }));
    }
  };

  const statusOptions = (o: Opportunity) =>
    Array.from(
      new Set<Status>([
        o.status,
        ...(FORWARD[o.status] ?? []),
        ...(ACTIVE.includes(o.status) ? TERMINAL_FROM_ACTIVE : []),
      ]),
    );
  const hasRows = opportunities.length > 0;

  const exportAll = async (format: "csv" | "json") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/opportunities/export?format=${format}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Export failed (${res.status})`);
      downloadBlob(await res.blob(), `opportunities-export-all.${format}`);
      setNotice(`Exported all opportunities as ${format.toUpperCase()}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to export opportunities");
    } finally {
      setBusy(false);
    }
  };

  const renderTable = (
    section: SectionKey,
    rows: { companyName: string; opportunities: Opportunity[] }[],
  ) =>
    rows.map((g) => {
      const key = `${section}:${g.companyName}`;
      const open = Boolean(companyOpen[key]);
      return (
        <div key={key} className="rounded-2xl border border-white/10 bg-slate-900/50">
          <button
            type="button"
            className="w-full px-4 py-3 text-left"
            onClick={() => setCompanyOpen((s) => ({ ...s, [key]: !s[key] }))}
          >
            <div className="mb-2 flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Company</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-semibold text-slate-100">{g.companyName}</p>
                <p className="text-xs text-slate-400">{g.opportunities.length} opportunities</p>
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                {open ? "Collapse" : "Expand"}
              </span>
            </div>
          </button>
          {open ? (
            <div className="overflow-auto border-t border-white/10">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-950/60 text-left text-xs uppercase tracking-[0.15em] text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-amber-200">Fit</th>
                    <th className="px-3 py-2 text-amber-200">Status</th>
                    <th className="px-3 py-2 text-amber-200">Next Action</th>
                    <th className="px-3 py-2">Date Created</th>
                    <th className="px-3 py-2">Job Title</th>
                    <th className="px-3 py-2">Company</th>
                    <th className="px-3 py-2">Salary</th>
                  </tr>
                </thead>
                <tbody>
                  {g.opportunities.map((o) => (
                    <tr
                      key={o.id}
                      ref={(n) => {
                        refs.current[o.id] = n;
                      }}
                      className={`border-t border-white/10 ${highlightId === o.id ? "bg-amber-400/10 ring-1 ring-amber-300/60" : ""}`}
                    >
                      <td className="px-3 py-2 text-slate-200">
                        <div className="font-semibold text-slate-100">{fit(o)}</div>
                        <div className="text-[11px] text-slate-500">{BAND_LABEL[o.currentBand]}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-200">
                        <div className="text-xs text-slate-400">{STATUS_LABEL[o.status]}</div>
                        <select
                          value={o.status}
                          onChange={(e) => void patchStatus(o.id, e.target.value as Status)}
                          disabled={pending[o.id] || busy}
                          className="mt-1 w-full rounded-xl border border-white/20 bg-slate-900/70 px-2 py-1 text-xs text-slate-100"
                        >
                          {statusOptions(o).map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                        {o.status !== "SAVED" ? (
                          <button
                            type="button"
                            className="mt-1 text-[11px] text-slate-400 underline-offset-4 hover:underline"
                            onClick={() => setResetTarget(o)}
                          >
                            Reset status
                          </button>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <FormButton
                          className="px-3 py-1 text-xs"
                          onClick={() =>
                            o.nextAction === "Generate Resume"
                              ? router.push("/studio")
                              : o.nextAction === "Improve Baseline"
                                ? router.push("/baseline")
                                : o.nextAction === "Follow Up"
                                  ? setDraftTarget(o)
                                  : focus(o.id)
                          }
                        >
                          {o.nextAction}
                        </FormButton>
                      </td>
                      <td className="px-3 py-2 text-slate-200">{fmtDate(o.dateCreated)}</td>
                      <td className="px-3 py-2 text-slate-100">{o.jobTitle}</td>
                      <td className="px-3 py-2 text-slate-200">{o.companyName}</td>
                      <td className="px-3 py-2 text-slate-200">{o.salary ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      );
    });

  return (
    <PageShell>
      <div className="space-y-8">
        <PageHeader
          title="Opportunities"
          description="Prioritize and execute your next steps."
          rightSlot={
            <div className="flex flex-wrap gap-2">
              <FormButton variant="ghost" disabled={loading || busy} onClick={() => void load()}>
                Refresh
              </FormButton>
              <details className="relative">
                <summary className="list-none">
                  <FormButton variant="ghost" className="cursor-pointer">
                    Export
                  </FormButton>
                </summary>
                <div className="absolute right-0 z-10 mt-2 w-64 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-xl">
                  <button
                    type="button"
                    disabled
                    title="Coming soon"
                    className="w-full cursor-not-allowed rounded-xl px-3 py-2 text-left text-sm text-slate-500"
                  >
                    Export CSV (current view)
                  </button>
                  <button
                    type="button"
                    disabled={!hasRows || busy}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void exportAll("csv")}
                  >
                    Export CSV (all)
                  </button>
                  <button
                    type="button"
                    disabled={!hasRows || busy}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void exportAll("json")}
                  >
                    Export JSON (all)
                  </button>
                </div>
              </details>
            </div>
          }
        />
        {error || notice ? (
          <div className="space-y-3">
            {error ? (
              <Alert intent="error" title="Error">
                {error}
              </Alert>
            ) : null}
            {notice ? <Alert intent="success">{notice}</Alert> : null}
          </div>
        ) : null}

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setActionsOpen((s) => !s)}
          >
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Actions Needed</h2>
              <p className="text-xs text-slate-400">Top priorities based on tracker signals.</p>
            </div>
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
              {actionsOpen ? "Hide" : "Show"}
            </span>
          </button>
          {actionsOpen ? (
            <div className="mt-4 space-y-3">
              {loading ? (
                <p className="text-sm text-slate-400">Loading actions...</p>
              ) : dedupActions.length === 0 ? (
                <p className="text-sm text-slate-400">No actions needed right now.</p>
              ) : (
                dedupActions.map((c) => (
                  <article
                    key={`${c.opportunityId}:${c.type}`}
                    className="rounded-2xl border border-white/10 bg-slate-900/50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-amber-200">{actionTitle(c.type)}</p>
                        <p className="text-sm font-semibold text-white">{c.jobTitle}</p>
                        <p className="text-xs text-slate-300">
                          {c.companyName} - {c.message}
                        </p>
                      </div>
                      <FormButton
                        variant="secondary"
                        onClick={() => {
                          const o = byId.get(c.opportunityId);
                          if (!o) return;
                          if (c.type === "follow_up") setDraftTarget(o);
                          else if (c.type === "dormant") setDormantTarget(o);
                          else focus(o.id);
                        }}
                      >
                        {c.type === "follow_up"
                          ? "Draft Email"
                          : c.type === "dormant"
                            ? "Reactivate or Close"
                            : "Review Opportunity"}
                      </FormButton>
                    </div>
                  </article>
                ))
              )}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow">
          <h2 className="text-lg font-semibold text-slate-100">Opportunity Intelligence</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Jobs Analyzed</p>
              <p className="mt-1 text-2xl font-semibold text-white">{intelligenceSummary.jobsAnalyzed}</p>
            </div>
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Strong Targets</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-200">{intelligenceSummary.strongTargets}</p>
            </div>
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Possible Targets</p>
              <p className="mt-1 text-2xl font-semibold text-amber-200">{intelligenceSummary.possibleTargets}</p>
            </div>
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/5 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Low Probability</p>
              <p className="mt-1 text-2xl font-semibold text-rose-200">{intelligenceSummary.lowProbability}</p>
            </div>
          </div>

          <div className="mt-5">
            <label className="flex max-w-sm flex-col gap-2 text-sm text-slate-300">
              Sort By
              <select
                className="rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-sm text-white"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as IntelligenceSort)}
              >
                <option value="best_fit">Best Fit</option>
                <option value="highest_confidence">Highest Confidence</option>
                <option value="lowest_competition_risk">Lowest Competition Risk</option>
                <option value="most_strategic">Most Strategic</option>
              </select>
            </label>
          </div>

          {!hasRows && !loading ? (
            <EmptyState
              title="Your opportunities will appear here."
              body="Analyze roles to unlock opportunity intelligence and recommended next actions."
              cta={
                <Link href="/analyze">
                  <FormButton>Analyze a Job</FormButton>
                </Link>
              }
              className="mt-6 min-h-[320px] justify-center border-white/15 bg-slate-950/40"
            />
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {sortedIntelligenceRows.map((o) => {
                const confidence = mapApplicationConfidence(o.currentScore);
                const competitionRisk = mapCompetitionRisk(o.currentScore);
                const signals = inferSignalsFromRoleTitle(o.jobTitle);
                return (
                  <article key={o.id} className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-white">{o.jobTitle}</p>
                      <p className="text-sm text-slate-300">{o.companyName}</p>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                      <p className="text-slate-300">
                        Fit Score: <span className="font-semibold text-white">{o.currentScore}</span>
                      </p>
                      <p className="text-slate-300">
                        Application Confidence: <span className="font-semibold text-white">{confidence}</span>
                      </p>
                      <p className="text-slate-300">
                        Competition Risk: <span className="font-semibold text-white">{competitionRisk}</span>
                      </p>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Strength Signals</p>
                        <ul className="mt-1 space-y-1 text-sm text-slate-200">
                          {signals.strengths.map((signal) => (
                            <li key={`${o.id}-strength-${signal}`}>• {signal}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Gap Signals</p>
                        <ul className="mt-1 space-y-1 text-sm text-slate-200">
                          {signals.gaps.map((signal) => (
                            <li key={`${o.id}-gap-${signal}`}>• {signal}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="mt-4">
                      <FormButton onClick={() => void router.push("/studio")}>
                        Prepare Application Materials
                      </FormButton>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(resetTarget)}
        title="Reset status?"
        description={
          resetTarget ? `Reset ${resetTarget.jobTitle} at ${resetTarget.companyName} back to Saved?` : undefined
        }
        confirmLabel="Reset to Saved"
        onCancel={() => setResetTarget(null)}
        onConfirm={() => {
          if (!resetTarget) return;
          const id = resetTarget.id;
          setResetTarget(null);
          void patchStatus(id, "SAVED", true);
        }}
      />

      {dormantTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/80">
            <h2 className="text-xl font-semibold text-slate-100">Reactivate or Close</h2>
            <p className="mt-2 text-sm text-slate-300">
              Choose what to do with {dormantTarget.jobTitle} at {dormantTarget.companyName}.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <FormButton variant="ghost" onClick={() => setDormantTarget(null)}>
                Cancel
              </FormButton>
              <FormButton
                variant="secondary"
                onClick={() => {
                  const id = dormantTarget.id;
                  setDormantTarget(null);
                  void patchStatus(id, "WITHDRAWN", true);
                }}
              >
                Close
              </FormButton>
              <FormButton
                onClick={() => {
                  const id = dormantTarget.id;
                  setDormantTarget(null);
                  void patchStatus(id, "SAVED", true);
                }}
              >
                Reactivate
              </FormButton>
            </div>
          </div>
        </div>
      ) : null}

      {draftTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/80">
            <h2 className="text-xl font-semibold text-slate-100">Draft Email</h2>
            <p className="mt-2 text-sm text-slate-300">Deterministic template. Update placeholders before sending.</p>
            <textarea
              readOnly
              className="mt-4 h-64 w-full rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-sm text-slate-100"
              value={emailDraft(draftTarget)}
            />
            <div className="mt-6 flex justify-end gap-3">
              <FormButton variant="ghost" onClick={() => setDraftTarget(null)}>
                Close
              </FormButton>
              <FormButton
                variant="secondary"
                onClick={() => void navigator.clipboard?.writeText(emailDraft(draftTarget))}
              >
                Copy draft
              </FormButton>
              <FormButton
                onClick={() => {
                  const id = draftTarget.id;
                  setDraftTarget(null);
                  focus(id);
                }}
              >
                Review Opportunity
              </FormButton>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
