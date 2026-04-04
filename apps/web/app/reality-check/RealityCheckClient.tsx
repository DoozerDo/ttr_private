"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const decodeComplianceFlags = (value: string | null): unknown[] => {
  if (!value) return [];
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
};

const formatComplianceFlag = (flag: unknown): string => {
  if (typeof flag === "string") return flag;
  if (typeof flag === "object" && flag !== null) {
    const candidate = (flag as { message?: string }).message ?? (flag as { code?: string }).code;
    if (typeof candidate === "string" && candidate.trim().length) {
      return candidate;
    }
    try {
      return JSON.stringify(flag);
    } catch {
      return String(flag);
    }
  }
  return String(flag);
};

export default function RealityCheckClient() {
  const searchParams = useSearchParams();
  const baselineId = searchParams.get("baselineId");
  const jobId = searchParams.get("jobId");
  const flags = decodeComplianceFlags(searchParams.get("flags"));

  const backParams = new URLSearchParams();
  if (baselineId) {
    backParams.set("baselineId", baselineId);
  }
  if (jobId) {
    backParams.set("jobId", jobId);
  }
  const backHref = backParams.toString() ? `/baseline?${backParams.toString()}` : "/baseline";

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-6 rounded-3xl border border-white/10 bg-slate-900/40 p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Reality Check</p>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Reality Check</h1>
          <p className="text-sm text-slate-300">
            Compliance must be resolved before the compatibility assessment can proceed.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.3em] text-amber-300">blocked</span>
            <p className="text-sm font-semibold text-amber-100">Assessment blocked</p>
          </div>
          <p className="mt-2 text-xs text-amber-200">
            Resolve the compliance flags below to continue scoring.
          </p>
        </div>
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Compliance flags</p>
            <span className="text-xs text-slate-400">
              {flags.length ? `${flags.length} flagged` : "No details provided"}
            </span>
          </div>
          {flags.length ? (
            <ul className="space-y-2 text-sm text-slate-100">
              {flags.map((flag, index) => (
                <li
                  key={`reality-flag-${index}`}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-100"
                >
                  {formatComplianceFlag(flag)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">No compliance flag details were provided.</p>
          )}
        </section>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href={backHref}
            className="text-sm font-semibold text-slate-100 underline decoration-white/20 decoration-2 underline-offset-4"
          >
            Back to baseline
          </Link>
        </div>
      </div>
    </div>
  );
}
