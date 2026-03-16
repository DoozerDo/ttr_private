"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ConfidenceLevel = "High" | "Moderate" | "Low";

type CareerGravityInsight = {
  summary: string;
  primaryRoleFamily: string;
  secondaryRoleFamily: string | null;
  seniorityTrend: string | null;
  confidence: ConfidenceLevel;
  supportingSignals: string[];
};

type CareerGravityResponse = {
  careerGravity: CareerGravityInsight | null;
};

const EMPTY_RESPONSE: CareerGravityResponse = {
  careerGravity: null,
};

export function CareerGravity() {
  const [payload, setPayload] = useState<CareerGravityResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/analysis/career-gravity", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          if (!cancelled) {
            setPayload(EMPTY_RESPONSE);
          }
          return;
        }

        const data = (await response.json()) as CareerGravityResponse;
        if (!cancelled) {
          setPayload(data ?? EMPTY_RESPONSE);
        }
      } catch {
        if (!cancelled) {
          setPayload(EMPTY_RESPONSE);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const insight = useMemo(() => payload.careerGravity, [payload.careerGravity]);

  if (loading) {
    return (
      <section className="space-y-2 rounded-[24px] border border-white/10 bg-slate-900/30 p-5">
        <h3 className="text-lg font-semibold text-slate-100">Career Gravity</h3>
        <p className="text-sm text-slate-400">Preparing compatibility report...</p>
      </section>
    );
  }

  if (!insight) {
    return (
      <section className="space-y-3 rounded-[24px] border border-white/10 bg-slate-900/30 p-5">
        <h3 className="text-lg font-semibold text-slate-100">Career Gravity</h3>
        <p className="text-sm leading-6 text-slate-400">
          Run several role analyses to identify where your strongest market alignment is emerging.
        </p>
        <Link
          href="#analyze-another-role"
          className="inline-flex rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-white/30 hover:text-white"
        >
          Analyze Another Role
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-[24px] border border-white/10 bg-slate-900/30 p-5">
      <header className="space-y-2 border-b border-white/10 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
          Profile Direction
        </p>
        <h3 className="text-2xl font-semibold tracking-tight text-slate-100">Career Gravity</h3>
        <p className="text-sm leading-6 text-slate-400">
          Where your strongest market alignment is starting to consolidate.
        </p>
      </header>

      <article className="space-y-3 rounded-[22px] border border-white/10 bg-slate-950/40 p-4">
        <p className="text-base leading-7 text-slate-100">{insight.summary}</p>
        <dl className="grid gap-3 border-t border-white/10 pt-3 text-sm text-slate-300 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">Primary Path</dt>
            <dd className="mt-1 text-sm text-slate-100">{insight.primaryRoleFamily}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">Secondary Path</dt>
            <dd className="mt-1 text-sm text-slate-100">{insight.secondaryRoleFamily ?? "n/a"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-slate-400">Confidence</dt>
            <dd className="mt-1 text-sm text-slate-100">{insight.confidence}</dd>
          </div>
        </dl>
      </article>

      {insight.supportingSignals.length ? (
        <article className="space-y-2 rounded-[22px] border border-white/10 bg-slate-950/40 p-4">
          <h4 className="text-sm font-semibold text-slate-100">Supporting Signals</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            {insight.supportingSignals.slice(0, 2).map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        </article>
      ) : null}
    </section>
  );
}
