// apps/web/app/results/page.tsx
"use client";

import type { CSSProperties } from "react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { InstrumentShell } from "../ui/InstrumentShell";
import { ttrComponents, ttrLayout, ttrTypography } from "../ui/ttrStyles";
import type { AnalysisResult, StoredPayload } from "../lib/session";

const STORAGE_KEY = "ttr:lastAnalysis";

function fitLabel(score: number | null) {
  if (score === null) return "";
  if (score >= 90) return "Strong fit";
  if (score >= 75) return "Solid fit";
  if (score >= 60) return "Mixed fit";
  return "Weak fit";
}

function safeParseStored(raw: string): { result: AnalysisResult; savedAt: string } | null {
  try {
    const parsed = JSON.parse(raw) as unknown;

    // New format: { result, savedAt }
    if (
      parsed &&
      typeof parsed === "object" &&
      "result" in parsed &&
      "savedAt" in parsed &&
      typeof (parsed as any).savedAt === "string"
    ) {
      const payload = parsed as StoredPayload;
      if (
        payload?.result &&
        (typeof payload.result.score === "number" || typeof payload.result.overallScore === "number")
      ) {
        return { result: payload.result, savedAt: payload.savedAt };
      }
    }

    // Old format: AnalysisResult directly
    if (parsed && typeof parsed === "object" && "score" in parsed && typeof (parsed as any).score === "number") {
      return { result: parsed as AnalysisResult, savedAt: new Date().toISOString() };
    }

    return null;
  } catch {
    return null;
  }
}

type GapDetail = {
  label?: string;
  domain?: string;
  confidence?: number;
  jdExcerpt?: string;
  baselineExcerpt?: string;
};

function isGapDetail(gap: unknown): gap is GapDetail {
  return (
    typeof gap === "object" &&
    gap !== null &&
    ("label" in gap || "domain" in gap || "confidence" in gap || "jdExcerpt" in gap || "baselineExcerpt" in gap)
  );
}

function formatConfidence(confidence: number) {
  const normalized = confidence <= 1 ? confidence * 100 : confidence;
  return `${Math.round(normalized)}%`;
}

function formatLastUpdated(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Unknown";
    return d.toLocaleString();
  } catch {
    return "Unknown";
  }
}

const ScoreRing = ({ score }: { score: number }) => {
  const radius = 64;
  const circumference = useMemo(() => 2 * Math.PI * radius, [radius]);
  const clamped = Math.min(Math.max(score, 0), 100);
  const offset = circumference * (1 - clamped / 100);
  const gradientId = "resultsScoreGradient";

  return (
    <div style={{ position: "relative", width: 160, height: 160, display: "grid", placeItems: "center" }}>
      <svg viewBox="0 0 200 200" style={{ width: "100%", height: "100%" }}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth={14} fill="none" />
        <circle
          cx="100"
          cy="100"
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={14}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 600ms ease-out", filter: "drop-shadow(0 0 18px rgba(255,165,0,0.18))" }}
        />
      </svg>

      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ fontSize: 34, fontWeight: 900, color: "#fde68a", textShadow: "0 2px 14px rgba(0,0,0,0.35)" }}>
            {Math.round(clamped)}
          </div>
          <div style={{ fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", color: "rgba(252, 211, 77, 0.8)" }}>
            Fit score
          </div>
        </div>
      </div>
    </div>
  );
};

const complianceExplanations: Record<string, string> = {
  "Baseline too short for reliable scoring":
    "We need more detail in the baseline to judge alignment confidently.",
  "Job description too short for reliable scoring":
    "The job post lacks detail, so the fit score may be noisy.",
  "Job description contains prompt-like content":
    "The job text looks like instructions to an AI rather than a real posting.",
  "Suspicious job source URL": "The job link is not a valid http(s) URL and may be unsafe.",
};

function explainComplianceFlag(flag: string) {
  return (
    complianceExplanations[flag] ??
    "We couldn’t map this flag yet—treat it as a caution and double-check the inputs."
  );
}

function ResultsContent() {
  const basePanelStyle: CSSProperties = ttrComponents.basePanel;

  const [stored, setStored] = useState<{ result: AnalysisResult; savedAt: string } | null>(null);
  const [interviewError, setInterviewError] = useState<string | null>(null);
  const [isCreatingInterview, setIsCreatingInterview] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const latestJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setStored(null);
        return;
      }

      const parsed = safeParseStored(raw);
      setStored(parsed);
    } catch {
      setStored(null);
    }
  }, []);

  useEffect(() => {
    const jobId = searchParams.get("jobId") ?? stored?.result?.jobId;
    if (!jobId || latestJobIdRef.current === jobId) return;

    latestJobIdRef.current = jobId;
    let cancelled = false;

    const loadLatest = async () => {
      try {
        const response = await fetch(`/api/analysis/job/${jobId}/latest`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as AnalysisResult;
        if (cancelled) return;
        const payload: StoredPayload = { result: data, savedAt: new Date().toISOString() };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        setStored(payload);
      } catch {
        // Ignore fetch errors; fall back to stored data.
      }
    };

    loadLatest();
    return () => {
      cancelled = true;
    };
  }, [searchParams, stored?.result?.jobId]);

  const score = stored?.result?.score ?? stored?.result?.overallScore ?? null;
  const label = fitLabel(score);
  const lastUpdated = stored?.savedAt ? formatLastUpdated(stored.savedAt) : "Not yet";

  const hasResult = score !== null;
  const baselineId = stored?.result?.baselineId ?? null;
  const verdict = stored?.result?.verdict ?? null;
  const dimensionScores = stored?.result?.dimensionScores ?? null;
  const strengths = stored?.result?.strengths ?? [];
  const rawGaps = (stored?.result?.gaps as unknown) ?? [];
  const gaps = Array.isArray(rawGaps) ? rawGaps : [];
  const gapDetails = gaps.filter(isGapDetail);
  const gapStrings = gaps.filter((gap): gap is string => typeof gap === "string");
  const complianceFlags = stored?.result?.complianceFlags ?? [];

  const handleCreateInterview = async () => {
    if (!baselineId) {
      setInterviewError("Save a baseline analysis first, then try again.");
      return;
    }

    setInterviewError(null);
    setIsCreatingInterview(true);

    try {
      const response = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error ?? "Unable to create interview session.";
        throw new Error(message);
      }

      const session = (await response.json()) as { id?: string };

      if (!session?.id) {
        throw new Error("Interview session response was incomplete.");
      }

      router.push(`/interviews/${session.id}`);
    } catch (error) {
      setInterviewError(error instanceof Error ? error.message : "Unable to create interview session.");
    } finally {
      setIsCreatingInterview(false);
    }
  };

  return (
    <InstrumentShell
      kicker="Output console"
      title="Results"
      subtitle="Review the most recent fit score, rationale, and the next actions. This is a staged UI shell for now."
    >
      <div style={ttrLayout.panelsRow}>
        <section style={{ ...basePanelStyle, flex: 1.05 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={ttrTypography.subtleLabel}>Snapshot</span>
            <h2 style={ttrTypography.h2}>Latest analysis</h2>
          </div>

          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.18)",
                padding: "12px 12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(241,245,249,0.92)" }}>Status</div>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>Last updated: {lastUpdated}</div>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                {hasResult ? (
                  <>
                    <ScoreRing score={score ?? 0} />
                    <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: "#fde68a" }}>{label}</div>
                      {verdict ? (
                        <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(251,191,36,0.9)" }}>
                          Verdict: {verdict}
                        </div>
                      ) : null}
                      <div style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(241,245,249,0.92)" }}>
                        {stored?.result?.summary || "Summary will appear here as the analyzer output is refined."}
                      </div>

                      {stored?.result?.baselineId ? (
                        <div style={{ fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
                          Baseline: {stored.result.baselineId}
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: "rgba(226,232,240,0.75)", lineHeight: 1.6 }}>
                    No saved analysis found yet. Run Analyze once and then return here.
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(251,191,36,0.2)",
                background: "rgba(251,191,36,0.08)",
                padding: "16px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={ttrTypography.subtleLabel}>Fit review</span>
                <p style={{ margin: 0, fontSize: 14, color: "rgba(241,245,249,0.9)" }}>
                  Ready to walk through your story? Capture quick interview notes while the analysis is fresh.
                </p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={handleCreateInterview}
                  disabled={!hasResult || isCreatingInterview}
                  style={{
                    ...ttrComponents.primaryButton,
                    opacity: !hasResult || isCreatingInterview ? 0.6 : 1,
                    cursor: !hasResult || isCreatingInterview ? "not-allowed" : "pointer",
                  }}
                >
                  {isCreatingInterview ? "Starting..." : "I think I’m qualified"}
                </button>
                {!hasResult ? (
                  <span style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>
                    Run an analysis first to unlock interview prep.
                  </span>
                ) : null}
              </div>
              {interviewError ? (
                <div style={ttrComponents.dangerBox}>{interviewError}</div>
              ) : null}
            </div>

            {hasResult ? (
              <div
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(0,0,0,0.18)",
                  padding: "14px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(241,245,249,0.92)" }}>Fit breakdown</div>
                {dimensionScores ? (
                  <div style={{ display: "grid", gap: 8, fontSize: 13, color: "rgba(226,232,240,0.8)" }}>
                    <div>Experience alignment: {dimensionScores.experienceAlignment}</div>
                    <div>Leadership level: {dimensionScores.leadershipLevel}</div>
                    <div>Technical platform fit: {dimensionScores.technicalPlatformFit}</div>
                    <div>Industry and context: {dimensionScores.industryContext}</div>
                    <div>Strategic vs tactical fit: {dimensionScores.strategicTacticalFit}</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>Dimension scores unavailable.</div>
                )}
              </div>
            ) : null}

            {hasResult ? (
              <div
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(0,0,0,0.18)",
                  padding: "14px 14px",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "#fde68a" }}>Alignment strengths</div>
                  {strengths.length ? (
                    <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18, color: "rgba(241,245,249,0.9)" }}>
                      {strengths.map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>No strengths identified yet.</div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "#fca5a5" }}>Gaps to address</div>
                  {gaps.length ? (
                    <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
                      {gapDetails.map((gap, index) => (
                        <div
                          key={`${gap.label ?? gap.domain ?? "gap"}-${index}`}
                          style={{
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(255,255,255,0.03)",
                            borderRadius: 10,
                            padding: "10px 12px",
                            display: "grid",
                            gap: 6,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                              alignItems: "baseline",
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 900, color: "#fca5a5" }}>
                              {gap.label ?? "Gap"}
                            </div>
                            <div style={{ fontSize: 12, color: "rgba(226,232,240,0.7)", display: "flex", gap: 12 }}>
                              {gap.domain ? <span>Domain: {gap.domain}</span> : null}
                              {typeof gap.confidence === "number" ? (
                                <span>Confidence: {formatConfidence(gap.confidence)}</span>
                              ) : null}
                            </div>
                          </div>
                          {gap.jdExcerpt ? (
                            <div style={{ fontSize: 12, color: "rgba(241,245,249,0.86)" }}>
                              <div style={{ fontWeight: 800, color: "rgba(241,245,249,0.75)" }}>JD Excerpt</div>
                              <div style={{ marginTop: 4, lineHeight: 1.5 }}>{gap.jdExcerpt}</div>
                            </div>
                          ) : null}
                          {gap.baselineExcerpt ? (
                            <div style={{ fontSize: 12, color: "rgba(241,245,249,0.86)" }}>
                              <div style={{ fontWeight: 800, color: "rgba(241,245,249,0.75)" }}>Baseline Excerpt</div>
                              <div style={{ marginTop: 4, lineHeight: 1.5 }}>{gap.baselineExcerpt}</div>
                            </div>
                          ) : null}
                        </div>
                      ))}

                      {gapStrings.length ? (
                        <ul style={{ margin: 0, paddingLeft: 18, color: "rgba(241,245,249,0.9)" }}>
                          {gapStrings.map((item, index) => (
                            <li key={`${item}-${index}`}>{item}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>No major gaps flagged.</div>
                  )}
                </div>
              </div>
            ) : null}

            {hasResult ? (
              <div
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(0,0,0,0.18)",
                  padding: "14px 14px",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(241,245,249,0.92)" }}>Compliance flags</div>
                {complianceFlags.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <ul style={{ margin: 0, paddingLeft: 18, color: "rgba(241,245,249,0.9)" }}>
                      {complianceFlags.map((flag, index) => (
                        <li key={`${flag}-${index}`}>{flag}</li>
                      ))}
                    </ul>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(241,245,249,0.78)" }}>
                        What this means
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, color: "rgba(226,232,240,0.9)" }}>
                        {complianceFlags.map((flag, index) => (
                          <li key={`${flag}-explanation-${index}`}>{explainComplianceFlag(flag)}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>No compliance flags.</div>
                )}
              </div>
            ) : null}

            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.18)",
                padding: "12px 12px",
              }}
            >
              <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: "rgba(241,245,249,0.92)" }}>Planned sections</p>
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap" }}>
                <span style={ttrComponents.chip}>Fit score and label</span>
                <span style={ttrComponents.chip}>Signals and gaps</span>
                <span style={ttrComponents.chip}>Recommended actions</span>
                <span style={ttrComponents.chip}>Exports and artifacts</span>
              </div>
            </div>

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
                <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(241,245,249,0.92)" }}>
                  Run a fit check first
                </div>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.65)" }}>
                  Analyze generates the data that populates this page.
                </div>
              </div>

              <Link href="/analyze" style={ttrComponents.quietButton}>
                Go to Analyze
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

          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={ttrTypography.subtleLabel}>Wireframe</span>
            <h2 style={ttrTypography.h2}>Layout preview</h2>
          </div>

          <div style={{ position: "relative", marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                border: "1px dashed rgba(255,255,255,0.16)",
                borderRadius: 14,
                padding: "22px 16px",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  letterSpacing: 2.5,
                  textTransform: "uppercase",
                  color: "rgba(226,232,240,0.65)",
                  fontWeight: 900,
                }}
              >
                Future view
              </p>
              <p style={{ marginTop: 10, marginBottom: 0, fontSize: 14, color: "rgba(241,245,249,0.9)" }}>
                This panel will host export buttons, a final verdict, and the action checklist without requiring users to hunt across screens.
              </p>
            </div>

            {hasResult ? (
              <div
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(0,0,0,0.18)",
                  padding: "12px 12px",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(241,245,249,0.92)" }}>Quick links</div>
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link href="/analyze" style={ttrComponents.quietButton}>
                    Run another analysis
                  </Link>
                  <Link href="/calibrate" style={ttrComponents.quietButton}>
                    Open Calibrate
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </InstrumentShell>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "rgba(226,232,240,0.8)" }}>Loading results…</div>}>
      <ResultsContent />
    </Suspense>
  );
}

// VERIFY:
// - TypeScript build succeeds for Results page updates.
// - Gaps render correctly for both string and object inputs.
// - Linting passes for this file.
// - Compliance flags show explanations with fallbacks for unknown values.
