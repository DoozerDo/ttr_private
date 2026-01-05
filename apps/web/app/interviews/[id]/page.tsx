"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { InstrumentShell } from "../../ui/InstrumentShell";
import { ttrComponents, ttrLayout, ttrTypography } from "../../ui/ttrStyles";
import type {
  AdditionDecisionPayload,
  InterviewGap,
  InterviewQuestion,
  InterviewSessionDto,
  RecommendedAddition,
  RecommendedAdditionDecision,
} from "../../../lib/interviews";

type ComplianceFlag = {
  code?: string;
  message?: string;
  severity?: string;
  questionIndex?: number;
  recommendationIndex?: number;
};

type ComplianceLookup = {
  general: ComplianceFlag[];
  questions: Record<number, ComplianceFlag[]>;
  recommendations: Record<number, ComplianceFlag[]>;
};

function normalizeCompliance(validationResults?: Record<string, unknown>): ComplianceLookup {
  const lookup: ComplianceLookup = { general: [], questions: {}, recommendations: {} };
  if (!validationResults) return lookup;

  const rawFlags =
    (validationResults as { complianceFlags?: unknown; compliance_flags?: unknown }).complianceFlags ??
    (validationResults as { compliance_flags?: unknown }).compliance_flags ??
    [];

  const flagsArray = Array.isArray(rawFlags) ? rawFlags : [];

  flagsArray.forEach((flag) => {
    const normalized: ComplianceFlag =
      typeof flag === "string"
        ? { message: flag }
        : typeof flag === "object" && flag !== null
          ? {
              code: (flag as { code?: string }).code,
              message: (flag as { message?: string }).message,
              severity: (flag as { severity?: string }).severity,
              questionIndex:
                (flag as { questionIndex?: number }).questionIndex ??
                (flag as { question_index?: number }).question_index ??
                (flag as { questionIdx?: number }).questionIdx,
              recommendationIndex:
                (flag as { recommendationIndex?: number }).recommendationIndex ??
                (flag as { recommendation_index?: number }).recommendation_index ??
                (flag as { recommendationIdx?: number }).recommendationIdx,
            }
          : {};

    if (normalized.questionIndex !== undefined && normalized.questionIndex >= 0) {
      const existing = lookup.questions[normalized.questionIndex] ?? [];
      lookup.questions[normalized.questionIndex] = [...existing, normalized];
      return;
    }

    if (normalized.recommendationIndex !== undefined && normalized.recommendationIndex >= 0) {
      const existing = lookup.recommendations[normalized.recommendationIndex] ?? [];
      lookup.recommendations[normalized.recommendationIndex] = [...existing, normalized];
      return;
    }

    lookup.general.push(normalized);
  });

  return lookup;
}

function readNumericField(payload: unknown, keys: string[]): number | null {
  if (!payload || typeof payload !== "object") return null;

  for (const key of keys) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === "number") return value;
  }

  return null;
}

export default function InterviewSessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params?.id;
  const [session, setSession] = useState<InterviewSessionDto | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decisionSavingId, setDecisionSavingId] = useState<string | null>(null);

  const applySessionUpdate = useCallback(
    (data: InterviewSessionDto, options?: { preserveAnswers?: boolean }) => {
      setSession(data);

      if (options?.preserveAnswers) {
        return;
      }

      const questionCount = data?.questions?.length ?? 0;
      const existingResponses =
        Array.isArray(data?.responses) && data.responses.length
          ? data.responses.map((entry) => entry?.toString() ?? "")
          : [];

      setAnswers((prev) => {
        if (prev.length === questionCount && existingResponses.length === 0) {
          return prev;
        }
        return Array.from({ length: questionCount }, (_, index) => existingResponses[index] ?? "");
      });
    },
    [],
  );

  useEffect(() => {
    if (!sessionId) return;

    const loadSession = async () => {
      try {
        const response = await fetch(`/api/interviews/${sessionId}`, { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Unable to load interview session.");
        }

        const data = (await response.json()) as InterviewSessionDto;
        applySessionUpdate(data);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load interview session.");
      }
    };

    loadSession();
  }, [applySessionUpdate, sessionId]);

  const questions: InterviewQuestion[] = useMemo(() => session?.questions ?? [], [session?.questions]);
  const gaps: InterviewGap[] = useMemo(() => session?.gapList ?? [], [session?.gapList]);
  const recommendedAdditions: RecommendedAddition[] = useMemo(() => {
    const additions = session?.recommendedAdditions ?? [];
    return additions.map((addition) => ({
      ...addition,
      status: addition.status ?? "proposed",
    }));
  }, [session?.recommendedAdditions]);
  const complianceLookup = useMemo(
    () => normalizeCompliance(session?.validationResults),
    [session?.validationResults],
  );

  const gapMap = useMemo(() => {
    const map = new Map<string, InterviewGap>();
    gaps.forEach((gap) => map.set(gap.gapId, gap));
    return map;
  }, [gaps]);

  const baselineVersionHash = useMemo(() => {
    if (typeof session?.baselineVersionHash === "string") return session.baselineVersionHash;

    const validation = session?.validationResults && typeof session.validationResults === "object"
      ? session.validationResults
      : null;

    if (!validation) return null;

    const camelCaseValue = (validation as { baselineVersionHash?: unknown }).baselineVersionHash;
    if (typeof camelCaseValue === "string") return camelCaseValue;

    const snakeCaseValue = (validation as { baseline_version_hash?: unknown }).baseline_version_hash;
    return typeof snakeCaseValue === "string" ? snakeCaseValue : null;
  }, [session]);

  const baselineVersionReference = useMemo(() => {
    const id = session?.baselineVersionId ?? null;
    if (id && baselineVersionHash) return `${id} (${baselineVersionHash})`;
    return id ?? baselineVersionHash ?? null;
  }, [baselineVersionHash, session?.baselineVersionId]);

  const expandedFitDetails = useMemo(() => {
    const assessment = session?.expandedFitAssessment;
    if (!assessment) return null;

    const expandedScore = readNumericField(assessment, ["expandedScore", "expanded_score"]);
    const originalScore = readNumericField(assessment, ["originalScore", "original_score"]);
    const delta = readNumericField(assessment, ["delta"]);

    if (expandedScore === null && originalScore === null && delta === null) return null;

    return { expandedScore, originalScore, delta };
  }, [session?.expandedFitAssessment]);

  const handleChange = (index: number, value: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const trimmedResponses = useMemo(
    () => answers.map((answer) => (answer ?? "").trim()),
    [answers],
  );

  const answeredCount = useMemo(
    () => trimmedResponses.filter((response) => response.length > 0).length,
    [trimmedResponses],
  );

  const handleSave = async () => {
    if (!sessionId) return;

    if (answeredCount === 0) {
      setError("Add at least one response before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/interviews/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses: trimmedResponses }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const messageText = payload?.error ?? payload?.message ?? "Unable to save responses.";
        throw new Error(messageText);
      }

      setMessage("Responses saved. You can revisit this page anytime.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save responses.");
    } finally {
      setSaving(false);
    }
  };

  const handleDecision = async (addition: RecommendedAddition, decision: RecommendedAdditionDecision) => {
    if (!sessionId || !addition?.id) return;

    const payload: { decisions: AdditionDecisionPayload[] } = {
      decisions: [{ additionId: addition.id, decision }],
    };

    setDecisionSavingId(addition.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/interviews/${sessionId}/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const payloadResponse = await response.json().catch(() => null);
        const messageText = payloadResponse?.error ?? payloadResponse?.message ?? "Unable to save decision.";
        throw new Error(messageText);
      }

      const updatedSession = (await response.json()) as InterviewSessionDto;
      applySessionUpdate(updatedSession, { preserveAnswers: true });
      setMessage("Decision saved.");
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Unable to save decision.");
    } finally {
      setDecisionSavingId(null);
    }
  };

  const recommendationStats = useMemo(() => {
    return recommendedAdditions.reduce(
      (acc, addition) => {
        if (addition.status === "accepted") acc.accepted += 1;
        else if (addition.status === "rejected") acc.rejected += 1;
        else if (addition.status === "deferred") acc.deferred += 1;
        return acc;
      },
      { accepted: 0, rejected: 0, deferred: 0 },
    );
  }, [recommendedAdditions]);

  return (
    <InstrumentShell
      kicker="Interview session"
      title="Fit Review"
      subtitle="Capture responses tied to each gap, review recommendations, and finish the baseline interview."
    >
      <div style={ttrLayout.panelsRow}>
        <section style={{ ...ttrComponents.basePanel, flex: 1.4, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={ttrTypography.subtleLabel}>Session details</span>
            <h2 style={ttrTypography.h2}>Interview prompts</h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {questions.length === 0 ? (
              <div style={ttrComponents.warningBox}>No interview questions were generated for this session.</div>
            ) : (
              questions.map((question, index) => {
                const gap = gapMap.get(question.gapId);
                const complianceFlags = complianceLookup.questions[index] ?? [];

                return (
                  <div key={`${question.prompt}-${index}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <label style={ttrComponents.fieldLabel}>{question.prompt}</label>
                      <div style={{ fontSize: 12, color: "rgba(226,232,240,0.72)", display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <span style={{ padding: "4px 8px", background: "rgba(148,163,184,0.12)", borderRadius: 6 }}>
                          Category: {question.category}
                        </span>
                        <span style={{ padding: "4px 8px", background: "rgba(148,163,184,0.12)", borderRadius: 6 }}>
                          Gap: {question.gapId}
                        </span>
                        {gap ? (
                          <span style={{ padding: "4px 8px", background: "rgba(148,163,184,0.12)", borderRadius: 6 }}>
                            Domain: {gap.domain} | Confidence: {gap.confidence}
                          </span>
                        ) : null}
                      </div>
                      {gap ? (
                        <div style={{ fontSize: 12, color: "rgba(226,232,240,0.8)", lineHeight: 1.5 }}>
                          JD excerpt: <em>{gap.jdExcerpt}</em>
                          {gap.baselineExcerpt ? (
                            <>
                              {" "}
                              | Baseline: <em>{gap.baselineExcerpt}</em>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                      <div style={{ fontSize: 11, color: "rgba(226,232,240,0.65)" }}>
                        Reason: Generated from gap {question.gapId}.
                      </div>
                    </div>

                    <textarea
                      style={{ ...ttrComponents.textArea, minHeight: 120 }}
                      value={answers[index] ?? ""}
                      onChange={(event) => handleChange(index, event.target.value)}
                    />

                    {complianceFlags.length ? (
                      <div style={ttrComponents.warningBox}>
                        <strong>Compliance checks:</strong>
                        <ul style={{ margin: "6px 0 0 18px", padding: 0, color: "rgba(226,232,240,0.85)", fontSize: 13 }}>
                          {complianceFlags.map((flag, flagIndex) => (
                            <li key={`${flag.code ?? flag.message ?? flagIndex}-${flagIndex}`}>
                              {flag.code ? `${flag.code}: ` : ""}
                              {flag.message ?? "Flagged response"}
                              {flag.severity ? ` (severity: ${flag.severity})` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  ...ttrComponents.primaryButton,
                  opacity: saving ? 0.6 : 1,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Saving..." : "Save responses"}
              </button>
              <span style={{ fontSize: 12, color: "rgba(226,232,240,0.7)" }}>
                Session ID: {sessionId}
              </span>
            </div>

            {message ? <div style={ttrComponents.successBox}>{message}</div> : null}
            {error ? <div style={ttrComponents.dangerBox}>{error}</div> : null}
          </div>
        </section>

        <section style={{ ...ttrComponents.basePanel, flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={ttrTypography.subtleLabel}>Session</span>
            <h2 style={ttrTypography.h2}>Overview</h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "rgba(241,245,249,0.85)" }}>
              Status: <strong>{session?.status ?? "loading"}</strong>
            </div>
            <div style={{ fontSize: 13, color: "rgba(226,232,240,0.7)" }}>
              Baseline: {session?.baselineId ?? "..."}
            </div>
            {baselineVersionReference ? (
              <div style={{ fontSize: 13, color: "rgba(226,232,240,0.7)" }}>
                Baseline version reference: {baselineVersionReference}
              </div>
            ) : null}
            {session?.jobId ? (
              <div style={{ fontSize: 13, color: "rgba(226,232,240,0.7)" }}>
                Job: {session.jobId}
              </div>
            ) : null}
            <div style={{ fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
              Created: {session?.createdAt ? new Date(session.createdAt).toLocaleString() : "..."}
            </div>
            <div style={{ fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
              Updated: {session?.updatedAt ? new Date(session.updatedAt).toLocaleString() : "..."}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={ttrTypography.subtleLabel}>Detected gaps</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {gaps.length === 0 ? (
                  <div style={ttrComponents.warningBox}>No gaps were returned for this interview.</div>
                ) : (
                  gaps.map((gap) => (
                    <div
                      key={gap.gapId}
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid rgba(148,163,184,0.3)",
                        background: "rgba(15,23,42,0.6)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                        <strong style={{ color: "#e2e8f0" }}>{gap.gapId}</strong>
                        <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(148,163,184,0.18)", fontSize: 12 }}>
                          Domain: {gap.domain}
                        </span>
                        <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(148,163,184,0.18)", fontSize: 12 }}>
                          Confidence: {gap.confidence}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "rgba(226,232,240,0.9)" }}>
                        JD: <em>{gap.jdExcerpt}</em>
                      </div>
                      {gap.baselineExcerpt ? (
                        <div style={{ fontSize: 12, color: "rgba(226,232,240,0.75)" }}>
                          Baseline: <em>{gap.baselineExcerpt}</em>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={ttrTypography.subtleLabel}>Recommendations</span>
              {recommendedAdditions.length === 0 ? (
                <div style={ttrComponents.warningBox}>No recommended additions for this interview.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {recommendedAdditions.map((addition, index) => {
                    const complianceFlags = complianceLookup.recommendations[index] ?? [];
                    const acceptBlocked = complianceFlags.length > 0;
                    const isSavingDecision = decisionSavingId === addition.id;
                    const status = addition.status;

                    const statusBadge =
                      status === "accepted"
                        ? { label: "Accepted", background: "rgba(74,222,128,0.15)", color: "#86efac" }
                        : status === "rejected"
                          ? { label: "Rejected", background: "rgba(248,113,113,0.18)", color: "#fca5a5" }
                          : status === "deferred"
                            ? { label: "Deferred", background: "rgba(251,191,36,0.15)", color: "#fcd34d" }
                            : { label: "Proposed", background: "rgba(148,163,184,0.18)", color: "#cbd5e1" };

                    return (
                      <div
                        key={addition.id ?? `${addition.text}-${index}`}
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          border: "1px solid rgba(148,163,184,0.28)",
                          background: "rgba(15,23,42,0.6)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
                          <div style={{ color: "rgba(226,232,240,0.9)", fontSize: 14, flex: 1 }}>
                            {addition.text || addition.id}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: 6,
                                background: statusBadge.background,
                                color: statusBadge.color,
                                fontSize: 12,
                              }}
                            >
                              {isSavingDecision ? "Saving..." : statusBadge.label}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => handleDecision(addition, "accept")}
                            disabled={acceptBlocked || isSavingDecision}
                            style={{
                              ...ttrComponents.primaryButton,
                              padding: "6px 12px",
                              fontSize: 13,
                              opacity: acceptBlocked || isSavingDecision ? 0.5 : 1,
                              cursor: acceptBlocked || isSavingDecision ? "not-allowed" : "pointer",
                            }}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecision(addition, "reject")}
                            disabled={isSavingDecision}
                            style={{
                              ...ttrComponents.secondaryButton,
                              padding: "6px 12px",
                              fontSize: 13,
                              opacity: isSavingDecision ? 0.6 : 1,
                              cursor: isSavingDecision ? "not-allowed" : "pointer",
                            }}
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecision(addition, "defer")}
                            disabled={isSavingDecision}
                            style={{
                              ...ttrComponents.quietButton,
                              padding: "6px 12px",
                              fontSize: 13,
                              opacity: isSavingDecision ? 0.6 : 1,
                              cursor: isSavingDecision ? "not-allowed" : "pointer",
                            }}
                          >
                            Defer
                          </button>
                        </div>

                        {complianceFlags.length ? (
                          <div style={ttrComponents.warningBox}>
                            <strong>Compliance flags:</strong>
                            <ul style={{ margin: "6px 0 0 18px", padding: 0, color: "rgba(226,232,240,0.85)", fontSize: 13 }}>
                              {complianceFlags.map((flag, flagIndex) => (
                                <li key={`${flag.code ?? flag.message ?? flagIndex}-${flagIndex}`}>
                                  {flag.code ? `${flag.code}: ` : ""}
                                  {flag.message ?? "Flagged recommendation"}
                                  {flag.severity ? ` (severity: ${flag.severity})` : ""}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={ttrTypography.subtleLabel}>Completion</span>
              <h3 style={{ ...ttrTypography.h2, fontSize: 16, margin: 0 }}>Summary</h3>
            </div>
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <div style={{ padding: 12, borderRadius: 10, background: "rgba(148,163,184,0.12)", color: "#e2e8f0" }}>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.75)" }}>Detected gaps</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{gaps.length}</div>
              </div>
              <div style={{ padding: 12, borderRadius: 10, background: "rgba(148,163,184,0.12)", color: "#e2e8f0" }}>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.75)" }}>Questions answered</div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {answeredCount} / {questions.length}
                </div>
              </div>
              <div style={{ padding: 12, borderRadius: 10, background: "rgba(148,163,184,0.12)", color: "#e2e8f0" }}>
                <div style={{ fontSize: 12, color: "rgba(226,232,240,0.75)" }}>Recommendations</div>
                <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                  Accepted: <strong>{recommendationStats.accepted}</strong>
                  <br />
                  Rejected: <strong>{recommendationStats.rejected}</strong>
                  <br />
                  Deferred: <strong>{recommendationStats.deferred}</strong>
                </div>
              </div>
              {expandedFitDetails ? (
                <div style={{ padding: 12, borderRadius: 10, background: "rgba(148,163,184,0.12)", color: "#e2e8f0" }}>
                  <div style={{ fontSize: 12, color: "rgba(226,232,240,0.75)" }}>Expanded fit score</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>
                    {expandedFitDetails.expandedScore ?? "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(226,232,240,0.8)", lineHeight: 1.5 }}>
                    {expandedFitDetails.originalScore !== null && expandedFitDetails.originalScore !== undefined ? (
                      <>
                        Original: {expandedFitDetails.originalScore}
                        <br />
                      </>
                    ) : null}
                    {expandedFitDetails.delta !== null && expandedFitDetails.delta !== undefined ? (
                      <>Delta: {expandedFitDetails.delta >= 0 ? "+" : ""}{expandedFitDetails.delta}</>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => router.push("/fit-review")}
                style={{ ...ttrComponents.secondaryButton, padding: "10px 14px" }}
              >
                Back to fit review
              </button>
              <Link href="/results" style={{ ...ttrComponents.primaryButton, padding: "10px 14px", textDecoration: "none" }}>
                Continue
              </Link>
            </div>
          </div>
        </section>
      </div>
    </InstrumentShell>
  );
}
