// apps/web/app/analyze/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { BaselineDto } from "../../lib/baselines";
import type { JobDto } from "../../lib/jobs";
import { InstrumentShell } from "../ui/InstrumentShell";
import { ttrComponents, ttrTypography, ttrLayout } from "../ui/ttrStyles";
import type { AnalysisResult, StoredPayload } from "../lib/session";
import { normalizeAnalysisResult, saveLastAnalysis } from "../lib/session";

type ApiStatus = "unknown" | "online" | "offline";

type StoredState = {
  payload: StoredPayload | null;
  error: string | null;
};

const STORAGE_KEY = "ttr:lastAnalysis";

function readLastAnalysis(): StoredState {
  if (typeof window === "undefined") return { payload: null, error: null };

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { payload: null, error: null };

    const parsed = JSON.parse(raw) as StoredPayload;
    if (!parsed?.result) return { payload: null, error: null };

    return { payload: parsed, error: null };
  } catch (error) {
    console.error("Unable to load last analysis", error);
    return { payload: null, error: "We could not restore your last analysis." };
  }
}

const ScoreRing = ({ score, loading }: { score: number; loading: boolean }) => {
  const radius = 72;
  const circumference = useMemo(() => 2 * Math.PI * radius, [radius]);
  const clampedScore = Math.min(Math.max(score, 0), 100);
  const offset = circumference * (1 - clampedScore / 100);
  const gradientId = "scoreRingGradient";

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        height: 176,
        width: 176,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg viewBox="0 0 200 200" style={{ height: "100%", width: "100%" }}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <circle
          cx="100"
          cy="100"
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={14}
          fill="none"
        />
        <circle
          cx="100"
          cy="100"
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={14}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={loading ? circumference : offset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 800ms ease-out",
            filter: "drop-shadow(0 0 18px rgba(255,165,0,0.18))",
          }}
        />
      </svg>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: "#fde68a",
            textShadow: "0 2px 14px rgba(0,0,0,0.35)",
          }}
        >
          {Math.round(clampedScore)}
        </div>
        <span
          style={{
            marginTop: 6,
            fontSize: 11,
            letterSpacing: 2.5,
            textTransform: "uppercase",
            color: "rgba(252, 211, 77, 0.8)",
          }}
        >
          Fit score
        </span>
      </div>
    </div>
  );
};

function fitLabel(score: number | null) {
  if (score === null) return "";
  if (score >= 90) return "Strong fit";
  if (score >= 75) return "Solid fit";
  if (score >= 60) return "Mixed fit";
  return "Weak fit";
}

function signalQuality(score: number | null) {
  if (score === null) return { label: "n/a", color: "rgba(255,255,255,0.3)" };
  if (score >= 90) return { label: "High", color: "#22c55e" };
  if (score >= 75) return { label: "Medium", color: "#f59e0b" };
  return { label: "Low", color: "#f97316" };
}

function latestVersionId(baseline?: BaselineDto) {
  if (!baseline?.versions?.length) return "";
  const sorted = [...baseline.versions].sort((a, b) => b.versionNumber - a.versionNumber);
  return sorted[0]?.id ?? "";
}

export default function AnalyzePage() {
  const [baselines, setBaselines] = useState<BaselineDto[]>([]);
  const [baselineId, setBaselineId] = useState("");
  const [baselineVersionId, setBaselineVersionId] = useState("");
  const [baselineLoading, setBaselineLoading] = useState(true);
  const [baselineError, setBaselineError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [jobId, setJobId] = useState("");
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [animatedScore, setAnimatedScore] = useState(0);
  const [showRaw, setShowRaw] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const [apiStatus, setApiStatus] = useState<ApiStatus>("unknown");
  const router = useRouter();

  const hasBaseline = baselineId.trim().length > 0 && baselineVersionId.trim().length > 0;
  const hasSelectedJob = jobId.trim().length > 0;
  const hasJobDescription = jobDescription.trim().length > 0;
  const canAnalyze = !loading && hasBaseline && (hasSelectedJob || hasJobDescription);

  useEffect(() => {
    let cancelled = false;

    const loadBaselines = async () => {
      setBaselineLoading(true);
      setBaselineError(null);

      try {
        const response = await fetch("/api/baselines", { cache: "no-store" });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Unable to load baselines.");
        }

        const data = (await response.json()) as BaselineDto[];
        if (cancelled) return;

        setBaselines(data);

        if (data.length > 0) {
          setBaselineId((prev) => {
            if (prev && data.some((b) => b.id === prev)) return prev;
            return data[0].id;
          });
        } else {
          setBaselineId("");
          setBaselineVersionId("");
        }
      } catch (loadError) {
        if (cancelled) return;
        setBaselineError(
          loadError instanceof Error ? loadError.message : "Unable to load baselines.",
        );
        setBaselines([]);
        setBaselineId("");
        setBaselineVersionId("");
      } finally {
        if (!cancelled) setBaselineLoading(false);
      }
    };

    loadBaselines();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const selected = baselines.find((b) => b.id === baselineId);
    setBaselineVersionId(latestVersionId(selected));
  }, [baselineId, baselines]);

  useEffect(() => {
    let cancelled = false;

    const loadJobs = async () => {
      setJobsLoading(true);
      setJobsError(null);

      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Unable to load saved jobs.");
        }

        const data = (await response.json()) as JobDto[];
        if (cancelled) return;

        setJobs(data);

        if (data.length === 0) {
          setJobId("");
          return;
        }

        setJobId((prev) => {
          if (prev && data.some((job) => job.id === prev)) return prev;
          return "";
        });
      } catch (loadError) {
        if (cancelled) return;
        setJobsError(loadError instanceof Error ? loadError.message : "Unable to load saved jobs.");
        setJobs([]);
        setJobId("");
      } finally {
        if (!cancelled) setJobsLoading(false);
      }
    };

    loadJobs();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) {
      setAnimatedScore(0);
      return;
    }

    if (result?.score !== undefined && result?.score !== null) {
      setAnimatedScore(0);
      const frame = requestAnimationFrame(() => {
        setAnimatedScore(result.score);
      });
      return () => cancelAnimationFrame(frame);
    }

    setAnimatedScore(0);
  }, [loading, result]);

  useEffect(() => {
    let cancelled = false;

    const probe = async (url: string) => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        return res.ok;
      } catch {
        return false;
      }
    };

    const check = async () => {
      setApiStatus((prev) => (prev === "online" ? "online" : "unknown"));
      const online = (await probe("/api/status")) || (await probe("/api/health"));
      if (cancelled) return;
      setApiStatus(online ? "online" : "offline");
    };

    check();
    const interval = setInterval(check, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const { payload, error: restoreIssue } = readLastAnalysis();
    if (!payload && !restoreIssue) return;

    if (restoreIssue) {
      setRestoreError(restoreIssue);
    }

    if (payload?.result) {
      setResult(payload.result);
      setRestoredAt(payload.savedAt);
    }
  }, []);

  const handleAnalyze = async () => {
    if (!hasBaseline || (!hasSelectedJob && !hasJobDescription)) {
      setError("Please select a baseline and either choose a saved job or paste a description.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setShowRaw(false);

    try {
      let resolvedJobId = jobId;

      if (!hasSelectedJob && hasJobDescription) {
        const createResponse = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawDescription: jobDescription }),
        });

        if (!createResponse.ok) {
          const message = await createResponse.text();
          throw new Error(message || "Unable to save this job description.");
        }

        const created = (await createResponse.json()) as { id?: string };
        if (!created?.id) {
          throw new Error("Job creation response was incomplete.");
        }

        resolvedJobId = created.id;
        setJobId(created.id);
      }

      if (!baselineVersionId) {
        throw new Error("A baseline version is required to run Analyze.");
      }

      const requestJob: Record<string, unknown> = hasSelectedJob
        ? { id: resolvedJobId }
        : { raw_jd_text: jobDescription };

      const response = await fetch("/api/fit-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseline_version_id: baselineVersionId,
          job: requestJob,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Unable to analyze this role right now.");
      }

      const raw = await response.json();
      const data = normalizeAnalysisResult(raw);

      setResult(data);
      setRestoredAt(null);

      const payload: StoredPayload = { result: data, savedAt: new Date().toISOString() };
      saveLastAnalysis(payload);

      if (data.jobId) {
        router.push(`/results?jobId=${data.jobId}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unexpected error";
      setError(message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const scoreLabel = fitLabel(result?.score ?? null);
  const quality = signalQuality(result?.score ?? null);

  const pillColor =
    apiStatus === "online"
      ? "rgba(74, 222, 128, 0.15)"
      : apiStatus === "offline"
        ? "rgba(248, 113, 113, 0.18)"
        : "rgba(251, 191, 36, 0.18)";

  const pillBorder =
    apiStatus === "online"
      ? "1px solid rgba(74, 222, 128, 0.6)"
      : apiStatus === "offline"
        ? "1px solid rgba(248, 113, 113, 0.7)"
        : "1px solid rgba(251, 191, 36, 0.6)";

  const pillText =
    apiStatus === "online" ? "Online" : apiStatus === "offline" ? "Offline" : "Checking";

  const pillTextColor =
    apiStatus === "online" ? "#4ade80" : apiStatus === "offline" ? "#fca5a5" : "#fbbf24";

  const apiStatusPill = (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 999,
        background: pillColor,
        border: pillBorder,
        color: pillTextColor,
        fontSize: 13,
        fontWeight: 700,
      }}
      title="API status"
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: pillTextColor,
          boxShadow: `0 0 12px ${pillTextColor}`,
        }}
      />
      <span>{pillText}</span>
    </div>
  );

  const basePanelStyle: CSSProperties = ttrComponents.basePanel;

  return (
    <InstrumentShell kicker="Role fit console" title="Baseline analyzer" rightSlot={apiStatusPill}>
      <div style={ttrLayout.panelsRow}>
        <section style={{ ...basePanelStyle, flex: 1.05 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={ttrTypography.subtleLabel}>Input</span>
              <h2 style={ttrTypography.h2}>Baseline + role</h2>
            </div>

            <div
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(251,191,36,0.9)",
                border: "1px solid rgba(251,191,36,0.35)",
                background: "rgba(251,191,36,0.08)",
              }}
            >
              Encrypted transit
            </div>
          </div>

          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={ttrComponents.fieldLabel} htmlFor="baselineId">
                Baseline
              </label>

              <select
                id="baselineId"
                name="baselineId"
                value={baselineId}
                onChange={(event) => setBaselineId(event.target.value)}
                style={ttrComponents.input}
                disabled={baselineLoading || baselines.length === 0}
              >
                {baselineLoading && <option value="">Loading baselines…</option>}
                {!baselineLoading && baselines.length === 0 && <option value="">No baselines uploaded yet</option>}
                {baselines.map((baseline) => (
                  <option key={baseline.id} value={baseline.id}>
                    {baseline.originalFilename}
                  </option>
                ))}
              </select>

              {baselineError ? (
                <p style={{ marginTop: 8, fontSize: 12, color: "rgba(248,113,113,0.75)" }}>{baselineError}</p>
              ) : (
                <p style={{ marginTop: 8, fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                  Choose one of your uploaded baselines to analyze against this role.
                </p>
              )}
            </div>

            <div>
              <label style={ttrComponents.fieldLabel} htmlFor="jobId">
                Saved job posting (optional)
              </label>

              <select
                id="jobId"
                name="jobId"
                value={jobId}
                onChange={(event) => setJobId(event.target.value)}
                style={ttrComponents.input}
                disabled={jobsLoading || jobs.length === 0}
              >
                <option value="">Select a saved job</option>
                {jobsLoading && <option value="">Loading saved jobs…</option>}
                {!jobsLoading && jobs.length === 0 && <option value="">No saved jobs yet</option>}
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title || "Untitled role"}
                    {job.company ? ` · ${job.company}` : ""}
                  </option>
                ))}
              </select>

              {jobsError ? (
                <p style={{ marginTop: 8, fontSize: 12, color: "rgba(248,113,113,0.75)" }}>{jobsError}</p>
              ) : (
                <p style={{ marginTop: 8, fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                  Pick a previously saved job posting or paste a new description below.
                </p>
              )}
            </div>

            <div>
              <label style={ttrComponents.fieldLabel} htmlFor="jobDescription">
                Paste a new job description
              </label>

              <textarea
                id="jobDescription"
                name="jobDescription"
                rows={8}
                value={jobDescription}
                onChange={(event) => setJobDescription(event.target.value)}
                placeholder="Paste the role you want to target..."
                style={{
                  ...ttrComponents.input,
                  resize: "vertical",
                  minHeight: 150,
                  fontFamily: "Inter, system-ui, -apple-system, sans-serif",
                }}
              />

              <p style={{ marginTop: 8, fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                We only send this content to the analyzer service for this check. If you select a saved
                job posting, we will use that instead.
              </p>

              <div style={{ fontSize: 12, color: "rgba(226,232,240,0.55)" }}>
                Characters: {jobDescription.length}
              </div>
            </div>

            {error && <div style={ttrComponents.dangerBox}>{error}</div>}
            {restoreError && <div style={ttrComponents.dangerBox}>{restoreError}</div>}

            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              style={{
                ...ttrComponents.primaryButton,
                cursor: canAnalyze ? "pointer" : "not-allowed",
                opacity: canAnalyze ? 1 : 0.6,
              }}
            >
              {loading ? "Analyzing…" : "Analyze role fit"}
            </button>

            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(241,245,249,0.92)" }}>
                  Want to tune what matters
                </div>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                  Use Calibrate to preview signal weighting before we wire it into scoring.
                </div>
              </div>

              <Link href="/calibrate" style={ttrComponents.quietButton}>
                Open Calibrate
              </Link>
            </div>
          </div>
        </section>

        <section style={{ ...basePanelStyle, flex: 0.95, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 20% 0%, rgba(251,191,36,0.08), transparent 35%), radial-gradient(circle at 90% 20%, rgba(255,255,255,0.05), transparent 30%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={ttrTypography.subtleLabel}>Results</span>
              <h2 style={ttrTypography.h2}>Fit telemetry</h2>
            </div>
            <div
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(226,232,240,0.9)",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.06)",
              }}
            >
              Live feed
            </div>
          </div>

          <div style={{ position: "relative", marginTop: 20 }}>
            {!loading && !result && (
              <div
                style={{
                  border: "1px dashed rgba(251,191,36,0.35)",
                  borderRadius: 14,
                  padding: "32px 22px",
                  background: "rgba(255,255,255,0.03)",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    color: "rgba(251,191,36,0.75)",
                    fontWeight: 700,
                  }}
                >
                  Awaiting analysis
                </p>
                <p style={{ marginTop: 10, fontSize: 15, color: "rgba(241,245,249,0.9)" }}>
                  Run an analysis to see a scored ring, quick fit verdict, and tailored notes for this role.
                </p>
                {restoredAt ? (
                  <p style={{ marginTop: 10, fontSize: 12, color: "rgba(226,232,240,0.75)" }}>
                    Last run restored from this browser: {new Date(restoredAt).toLocaleString()}
                  </p>
                ) : null}
              </div>
            )}

            {loading && <p style={{ margin: 0, fontSize: 13, color: "rgba(226,232,240,0.75)" }}>Analyzing…</p>}

            {!loading && result && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <ScoreRing score={animatedScore} loading={loading} />
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fde68a" }}>{scoreLabel}</div>
                  </div>

                  <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", gap: 10 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        letterSpacing: 2,
                        textTransform: "uppercase",
                        color: "rgba(251,191,36,0.75)",
                        fontWeight: 700,
                      }}
                    >
                      Alignment summary
                    </p>

                    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "rgba(241,245,249,0.95)" }}>
                      {result.summary || "We will summarize how your baseline maps to this role once analysis completes."}
                    </p>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 120,
                          height: 8,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.08)",
                          overflow: "hidden",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(Math.max((result.score ?? 0) / 100, 0), 1) * 100}%`,
                            height: "100%",
                            background: quality.color,
                            transition: "width 400ms ease",
                          }}
                        />
                      </div>

                      <span style={{ fontSize: 12, color: "rgba(226,232,240,0.7)", fontWeight: 700 }}>
                        Signal quality: {quality.label}
                      </span>
                    </div>

                    {result.baselineId && (
                      <div style={{ fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
                        Baseline: {result.baselineId}
                      </div>
                    )}

                    {restoredAt ? (
                      <div style={{ fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
                        Restored from your last browser session: {new Date(restoredAt).toLocaleString()}
                      </div>
                    ) : null}
                  </div>
                </div>

                {result.strengths?.length ? (
                  <div>
                    <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#fde68a" }}>
                      Signals in your favor
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap" }}>
                      {result.strengths.map((item, index) => (
                        <span key={`${item}-${index}`} style={ttrComponents.chip}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {result.gaps?.length ? (
                  <div>
                    <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#fca5a5" }}>
                      Gaps to address
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap" }}>
                      {result.gaps.map((item, index) => (
                        <span
                          key={`${item}-${index}`}
                          style={{
                            ...ttrComponents.chip,
                            background: "rgba(248,113,113,0.12)",
                            border: "1px solid rgba(248,113,113,0.4)",
                            color: "#fecdd3",
                          }}
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {result.recommendedActions?.length ? (
                  <div
                    style={{
                      marginTop: 6,
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "1px solid rgba(251,191,36,0.25)",
                      background: "rgba(251,191,36,0.06)",
                    }}
                  >
                    <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#fde68a" }}>
                      Next steps
                    </p>

                    <ol
                      style={{
                        margin: 0,
                        paddingLeft: 18,
                        display: "grid",
                        gap: 6,
                        color: "rgba(241,245,249,0.9)",
                        fontSize: 14,
                      }}
                    >
                      {result.recommendedActions.map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                  <Link
                    href={result?.jobId ? `/results?jobId=${result.jobId}` : "/results"}
                    style={ttrComponents.quietButton}
                  >
                    View in Results
                  </Link>

                  <button
                    type="button"
                    onClick={() => setShowRaw((prev) => !prev)}
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.75)",
                      padding: "6px 10px",
                      borderRadius: 10,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {showRaw ? "Hide raw" : "View raw JSON"}
                  </button>
                </div>

                {showRaw ? (
                  <pre
                    style={{
                      margin: 0,
                      marginTop: 6,
                      padding: 12,
                      borderRadius: 10,
                      background: "rgba(0,0,0,0.35)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      color: "#e2e8f0",
                      fontSize: 12,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {JSON.stringify(result, null, 2)}
                  </pre>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>
    </InstrumentShell>
  );
}
