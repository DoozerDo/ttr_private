"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Alert } from "@/components/Alert";
import { TierGateNotice } from "@/components/TierGateNotice";
import {
  ComplianceFlag,
  ComplianceFlagPanel,
  ComplianceViolationPanel,
} from "@/components/ComplianceViolationPanel";
import { InsufficientExtractedText } from "@/components/compliance/InsufficientExtractedText";
import { EmptyState } from "@/components/EmptyState";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import {
  formatErrorMessage,
  parseComplianceError,
  readResponsePayload,
  type ParsedComplianceError,
} from "@/lib/compliance/parseComplianceError";
import { listBaselines } from "@/lib/baselines";
import {
  fetchStudyPacket,
  StudyPacketError,
  type FollowUpPayload,
  type StudyPacket,
} from "@/lib/interviewToolkit";
import { getInterviewResourcesForJob } from "@/lib/interviewToolkit/resources";
import { LikelyQuestionsPanel } from "./_components/LikelyQuestionsPanel";
import { ResourcesList } from "./_components/ResourcesList";
import { parseTierGateError, type TierGateError } from "@/lib/tiers";

interface JobDto {
  id: string;
  title: string | null;
  company: string | null;
}

function describeComplianceSummary(error: ParsedComplianceError) {
  const extras = [
    error.auditId ? `Audit ${error.auditId}` : null,
    error.baselineVersionHash ? `Baseline ${error.baselineVersionHash}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if ("violations" in error) {
    const violations = error.violations
      .map((violation) => violation.message || violation.code)
      .filter(Boolean)
      .join("; ");

    return [violations || "Compliance validation failed.", extras]
      .filter(Boolean)
      .join(" · ");
  }

  const detailsSummary =
    typeof error.details?.extractedChars === "number" &&
    typeof error.details?.minChars === "number"
      ? `Insufficient extracted resume text. Extracted ${error.details.extractedChars.toLocaleString()} characters. Minimum is ${error.details.minChars.toLocaleString()}.`
      : "Insufficient extracted resume text.";

  return [detailsSummary, extras].filter(Boolean).join(" · ");
}

function normalizeComplianceWarnings(
  flags:
    | Array<{ code?: string; message?: string; severity?: string }>
    | undefined
    | null,
): ComplianceFlag[] {
  const raw = Array.isArray(flags) ? flags : [];

  const normalized: ComplianceFlag[] = [];
  for (const f of raw) {
    const severity = typeof f?.severity === "string" ? f.severity : "warn";
    if (severity.toLowerCase() === "block") continue;

    const message = typeof f?.message === "string" ? f.message : null;
    if (!message) continue;

    const code = typeof f?.code === "string" ? f.code : null;

    normalized.push({
      code,
      message,
      severity,
    });
  }

  return normalized;
}

export default function InterviewToolkitPage() {
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [jobState, setJobState] = useState<"idle" | "loading" | "error">(
    "loading",
  );
  const [jobError, setJobError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>("");

  const [packet, setPacket] = useState<StudyPacket | null>(null);
  const [packetState, setPacketState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const [packetError, setPacketError] = useState<string | null>(null);
  const [packetDebugInfo, setPacketDebugInfo] = useState<{ status?: number; endpoint: string } | null>(
    null,
  );
  const [fitBaselineVersionId, setFitBaselineVersionId] = useState<string | null>(null);
  const [fitBaselineFetchState, setFitBaselineFetchState] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [fallbackBaselineVersionId, setFallbackBaselineVersionId] = useState<string | null>(
    null,
  );
  const [fallbackBaselineState, setFallbackBaselineState] = useState<
    "loading" | "ready" | "error"
  >("loading");

  const [followUpNotes, setFollowUpNotes] = useState<string>("");
  const [followUp, setFollowUp] = useState<FollowUpPayload | null>(null);
  const [followUpState, setFollowUpState] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [followUpComplianceError, setFollowUpComplianceError] =
    useState<ParsedComplianceError | null>(null);
  const [followUpTierGate, setFollowUpTierGate] = useState<TierGateError | null>(
    null,
  );

  const followUpWarningFlags = useMemo(
    () => normalizeComplianceWarnings(followUp?.complianceFlags),
    [followUp?.complianceFlags],
  );
  const followUpAuditId = followUp?.auditId;
  const followUpBaselineHash = followUp?.baselineVersionHash ?? null;

  const [copied, setCopied] = useState<boolean>(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const [storyRefreshKey, setStoryRefreshKey] = useState(0);
  const resources = useMemo(
    () => getInterviewResourcesForJob(selectedJobId || null),
    [selectedJobId],
  );

  const debugUiEnabled =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_UI === "true";

  useEffect(() => {
    const loadJobs = async () => {
      setJobState("loading");
      setJobError(null);
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        if (!res.ok) {
          throw new Error((await res.text()) || "Unable to load jobs");
        }
        const data = (await res.json()) as JobDto[];
        setJobs(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0) {
          setSelectedJobId((prev) => {
            if (prev && data.some((j) => j.id === prev)) return prev;
            return data[0].id;
          });
        }
        setJobState("idle");
      } catch (error) {
        setJobError(
          error instanceof Error ? error.message : "Unable to load jobs",
        );
        setJobs([]);
        setJobState("error");
      }
    };

    loadJobs();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = () => setStoryRefreshKey((prev) => prev + 1);
    window.addEventListener("starStories.updated", handler);

    return () => {
      window.removeEventListener("starStories.updated", handler);
    };
  }, []);

  useEffect(() => {
    const loadPacket = async () => {
      if (!selectedJobId) {
        setPacket(null);
        setPacketState("idle");
        setPacketError(null);
        setPacketDebugInfo(null);
        return;
      }

      setPacketState("loading");
      setPacketError(null);
      setPacketDebugInfo(null);

      try {
        const data = await fetchStudyPacket(selectedJobId);
        setPacket(data);
        setPacketState("idle");
      } catch (error) {
        setPacket(null);
        if (error instanceof StudyPacketError) {
          setPacketError(error.message);
          setPacketDebugInfo({
            endpoint: error.endpoint,
            status: error.status,
          });
        } else {
          setPacketError(
            error instanceof Error
              ? error.message
              : "Unable to build study packet",
          );
          setPacketDebugInfo(null);
        }
        setPacketState("error");
      }
    };

    loadPacket();
  }, [selectedJobId, storyRefreshKey]);

  useEffect(() => {
    const assessmentId = packet?.fitSnapshot?.assessmentId?.trim();
    if (!assessmentId) {
      setFitBaselineVersionId(null);
      setFitBaselineFetchState("idle");
      return;
    }

    let canceled = false;

    const fetchBaselineVersionId = async () => {
      setFitBaselineFetchState("loading");

      try {
        const res = await fetch(
          `/api/analysis/fit-assessments/${encodeURIComponent(assessmentId)}`,
          { cache: "no-store" },
        );

        if (!res.ok) {
          throw new Error("Unable to load the associated assessment");
        }

        const payload = (await res.json()) as { baselineVersionId?: string | null };
        if (canceled) return;

        const normalizedBaselineVersionId =
          typeof payload?.baselineVersionId === "string"
            ? payload.baselineVersionId.trim()
            : "";
        setFitBaselineVersionId(normalizedBaselineVersionId || null);
        setFitBaselineFetchState("idle");
      } catch (error) {
        if (canceled) return;
        console.error("Unable to resolve baseline version for follow-up", error);
        setFitBaselineVersionId(null);
        setFitBaselineFetchState("error");
      }
    };

    fetchBaselineVersionId();

    return () => {
      canceled = true;
    };
  }, [packet?.fitSnapshot?.assessmentId]);

  useEffect(() => {
    let canceled = false;

    const loadLatestBaselineVersion = async () => {
      setFallbackBaselineState("loading");

      try {
        const baselines = await listBaselines();
        if (canceled) return;

        let latestBaselineVersionId: string | null = null;
        let latestTimestamp = -Infinity;

        for (const baseline of baselines) {
          const versions = baseline.versions ?? [];
          for (const version of versions) {
            const timestamp = version.createdAt
              ? Date.parse(version.createdAt)
              : Number.NEGATIVE_INFINITY;
            const normalizedTimestamp = Number.isFinite(timestamp)
              ? timestamp
              : Number.NEGATIVE_INFINITY;
            if (normalizedTimestamp > latestTimestamp) {
              latestTimestamp = normalizedTimestamp;
              latestBaselineVersionId = version.id;
            }
          }
        }

        setFallbackBaselineVersionId(latestBaselineVersionId);
        setFallbackBaselineState("ready");
      } catch (error) {
        if (canceled) return;
        console.error("Unable to load baseline versions", error);
        setFallbackBaselineVersionId(null);
        setFallbackBaselineState("error");
      }
    };

    loadLatestBaselineVersion();

    return () => {
      canceled = true;
    };
  }, []);

  const resolvedBaselineVersionId = fitBaselineVersionId ?? fallbackBaselineVersionId;
  const baselineSourcesResolved =
    fitBaselineFetchState !== "loading" && fallbackBaselineState === "ready";
  const showBaselineMissingAlert =
    baselineSourcesResolved && !resolvedBaselineVersionId;
  const showBaselineFallbackErrorAlert =
    fallbackBaselineState === "error" && !resolvedBaselineVersionId;

  const handleGenerateFollowUp = async () => {
    if (!selectedJobId) return;

    if (!resolvedBaselineVersionId) return;

    setFollowUpState("loading");
    setFollowUpError(null);
    setFollowUp(null);
    setCopied(false);
    setCopyError(null);
    setFollowUpComplianceError(null);
    setFollowUpTierGate(null);

    try {
      const res = await fetch("/api/interview-toolkit/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          jobId: selectedJobId,
          notes: followUpNotes,
          baselineVersionId: resolvedBaselineVersionId,
        }),
      });

      if (!res.ok) {
        const tierGate = await parseTierGateError(res);
        if (tierGate) {
          setFollowUpTierGate(tierGate);
          setFollowUpState("error");
          return;
        }

        const compliance = await parseComplianceError(res);
        if (compliance) {
          setFollowUpComplianceError(compliance);
          setFollowUpState("error");
          return;
        }

        const payload = await readResponsePayload(res);
        setFollowUpError(
          formatErrorMessage(payload, "Unable to generate follow up."),
        );
        setFollowUpState("error");
        return;
      }

      const data = (await res.json()) as FollowUpPayload;
      setFollowUp(data ?? null);
      setFollowUpState("idle");
    } catch (error) {
      setFollowUpError(
        error instanceof Error ? error.message : "Unable to generate follow up.",
      );
      setFollowUpState("error");
    }
  };

  const handleCopy = async () => {
    setCopyError(null);

    if (!followUp?.content) return;

    try {
      await navigator.clipboard.writeText(followUp.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to copy to clipboard.";
      setCopyError(message);
    }
  };

  const followUpFailureMessage =
    followUpState === "error"
      ? followUpTierGate?.message ??
        (followUpComplianceError
          ? describeComplianceSummary(followUpComplianceError)
          : followUpError)
      : null;

  return (
    <PageShell>
      <div className="space-y-6 pb-10">
        <PageHeader
          kicker="Interview Toolkit"
          title="Job-ready flows"
          description="Morning-of checklist, study packet, and follow-up copy tied to your saved job."
          rightSlot={
            <div className="flex flex-col gap-2 min-w-[240px]">
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Job
              </span>
              {jobState === "loading" ? (
                <div className="rounded-2xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200">
                  Loading jobs...
                </div>
              ) : jobs.length === 0 ? (
                <div className="rounded-2xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200">
                  No saved jobs yet
                </div>
              ) : (
                <select
                  value={selectedJobId}
                  onChange={(event) => setSelectedJobId(event.target.value)}
                  className="rounded-2xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
                >
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {([job.title, job.company]
                        .filter(Boolean)
                        .join(" at ") || job.id) as string}
                    </option>
                  ))}
                </select>
              )}
            </div>
          }
        />

        {jobError ? <Alert intent="error">{jobError}</Alert> : null}
        {jobs.length === 0 && jobState !== "loading" ? (
          <Alert intent="warning">
            Save a job to unlock the Interview Toolkit.
          </Alert>
        ) : null}

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              How to use this
            </p>
            <h2 className="text-lg font-semibold text-slate-100">
              Interview coaching guide
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2 rounded-2xl border border-white/5 bg-slate-900/40 p-4 text-sm text-slate-300">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">
                Morning Of
              </p>
              <p>
                Purpose: Use this checklist to refresh the job highlights, lock
                in logistics, and center your opener before the call.
              </p>
            </div>
            <div className="space-y-2 rounded-2xl border border-white/5 bg-slate-900/40 p-4 text-sm text-slate-300">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">
                Study packet
              </p>
              <p>
                Purpose: Keep the role-specific context, STAR story prompts, and
                likely questions handy so your prep stays focused.
              </p>
            </div>
            <div className="space-y-2 rounded-2xl border border-white/5 bg-slate-900/40 p-4 text-sm text-slate-300">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">
                Follow up generator
              </p>
              <p>
                Purpose: Turn your interview notes into compliant, job-centered
                follow-up copy you can copy and send quickly.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Pre-interview
              </p>
              <h2 className="text-lg font-semibold text-slate-100">Morning Of</h2>
            </div>
            <p className="text-sm text-slate-300">
              Ground yourself before the call. These reminders stay tied to the
              selected job.
            </p>
            <ul className="space-y-2 pl-5 text-sm text-slate-300 list-disc">
              <li>
                Re-read the job description and your baseline highlights mapped
                to this role.
              </li>
              <li>
                Pick 2-3 STAR stories that fit the role&rsquo;s gaps and keep them
                handy.
              </li>
              <li>
                Write down the company&rsquo;s product, user, and one recent headline
                to mention.
              </li>
              <li>
                Have the interviewer names, dial-in details, and time zones
                confirmed.
              </li>
              <li>
                Keep a one-line &ldquo;why me for this role&rdquo; ready as your opener.
              </li>
            </ul>
          </section>

          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Study packet
              </p>
              <h2 className="text-lg font-semibold text-slate-100">
                Study Packet
              </h2>
            </div>
            {packetState === "loading" ? (
              <div className="rounded-2xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200">
                Building study packet...
              </div>
            ) : packetState === "error" ? (
              <Alert intent="error">
                <div>{packetError ?? "Unable to build study packet."}</div>
                {debugUiEnabled && packetDebugInfo ? (
                  <p className="text-[11px] text-slate-400">
                    {typeof packetDebugInfo.status === "number"
                      ? `Status ${packetDebugInfo.status}. `
                      : ""}
                    Endpoint: {packetDebugInfo.endpoint}
                  </p>
                ) : null}
              </Alert>
            ) : packet ? (
              <div className="space-y-5">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Job
                  </p>
                  <p className="text-lg font-semibold text-slate-100">
                    {([packet.job.title, packet.job.company]
                      .filter(Boolean)
                      .join(" at ") || packet.job.id) as string}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {packet.fitSnapshot ? (
                    <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-slate-200">
                      Fit score {packet.fitSnapshot.overallScore} ·{" "}
                      {packet.fitSnapshot.verdict}
                    </span>
                  ) : (
                    <Alert intent="warning">
                      Run Analyze or Fit Review to see strengths and gaps.
                    </Alert>
                  )}
                  {packet.fitSnapshot && packet.fitSnapshot.strengths.length ? (
                    <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                      Top strength: {packet.fitSnapshot.strengths[0]}
                    </span>
                  ) : null}
                  {packet.fitSnapshot &&
                  (packet.fitSnapshot.criticalGaps?.length || packet.fitSnapshot.gaps.length) ? (
                    <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                      Key gap:{" "}
                      {packet.fitSnapshot.criticalGaps?.[0]?.title ??
                        packet.fitSnapshot.gaps[0]}
                    </span>
                  ) : null}
                </div>
                {packet.interviewRiskBriefing?.length ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Interview Risk Briefing
                    </p>
                    <ul className="space-y-2 text-sm text-slate-200">
                      {packet.interviewRiskBriefing.slice(0, 3).map((risk) => (
                        <li key={risk.riskId} className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
                          <p>
                            <span className="font-semibold text-white">{risk.topic}:</span>{" "}
                            {risk.whyTheyMayChallengeYou}
                          </p>
                          <p className="mt-1 text-xs text-slate-300">
                            <span className="font-semibold text-slate-200">Strategy:</span>{" "}
                            {risk.exampleResponseStrategies?.[0] ?? risk.howToAddressIt}
                          </p>
                          <p className="mt-1 text-xs text-slate-300">
                            <span className="font-semibold text-slate-200">Talking point:</span>{" "}
                            {risk.suggestedTalkingPoints?.[0] ?? risk.exampleTalkingPoint}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Recommended STAR stories
                    </p>
                    {packet.recommendedStories.length === 0 ? (
                      <span className="text-xs text-slate-400">None saved</span>
                    ) : null}
                  </div>
                  {packet.recommendedStories.length === 0 ? (
                    <Alert intent="warning">No STAR stories saved yet.</Alert>
                  ) : (
                    <ul className="space-y-2 text-sm text-slate-200">
                      {packet.recommendedStories.map((story) => (
                        <li key={story.id} className="flex flex-col gap-1">
                          <span className="font-semibold text-white">
                            {story.title}
                          </span>
                          {story.competencies?.length ? (
                            <span className="text-xs text-slate-400">
                              {story.competencies.slice(0, 3).join(", ")}
                              {story.competencies.length > 3 ? " and more" : ""}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                  <LikelyQuestionsPanel
                    signals={
                      packet.fitSnapshot?.criticalGaps?.length
                        ? packet.fitSnapshot.criticalGaps.map((gap) => gap.title)
                        : packet.fitSnapshot?.gaps ?? []
                    }
                  />
                {packet.recentStories.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Recent STAR stories
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-200">
                      {packet.recentStories.map((story) => (
                        <span
                          key={story.id}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1"
                        >
                          {story.title}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState
                title="No study packet"
                body="Select a job to build its study packet."
                className="max-w-full border border-dashed border-white/20 bg-transparent px-4 py-6 shadow-none text-slate-400"
              />
            )}
          </section>
        </div>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Post-interview
            </p>
            <h2 className="text-lg font-semibold text-slate-100">Follow Up</h2>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400">
              Notes to weave in
            </label>
            <textarea
              value={followUpNotes}
              onChange={(event) => setFollowUpNotes(event.target.value)}
              placeholder="Mention what resonated, next steps, or shared priorities"
              rows={4}
              className="w-full rounded-2xl border border-white/20 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 outline-none focus:border-amber-400 focus:bg-white/10"
            />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <FormButton
                onClick={handleGenerateFollowUp}
                disabled={
                  !selectedJobId ||
                  followUpState === "loading" ||
                  !resolvedBaselineVersionId
                }
              >
                {followUpState === "loading"
                  ? "Generating..."
                  : "Generate follow up"}
              </FormButton>
            </div>
            {showBaselineFallbackErrorAlert ? (
              <Alert intent="warning">
                Unable to load your saved baselines right now. Refresh or upload a
                baseline to generate follow-up copy.
              </Alert>
            ) : showBaselineMissingAlert ? (
              <Alert intent="warning">
                Follow-up generation requires a baseline version. Create or select
                a baseline before continuing.
              </Alert>
            ) : null}
            {followUpFailureMessage ? (
              <Alert intent="error">{followUpFailureMessage}</Alert>
            ) : null}
          </div>

          {followUpTierGate ? <TierGateNotice error={followUpTierGate} /> : null}
          {followUpComplianceError?.type === "insufficient_extracted_text" ? (
            <InsufficientExtractedText error={followUpComplianceError} />
          ) : followUpComplianceError ? (
            <ComplianceViolationPanel error={followUpComplianceError} />
          ) : null}

          {followUp ? (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">Draft</h3>
                <FormButton
                  variant="secondary"
                  onClick={handleCopy}
                  disabled={!followUp.content || copied}
                >
                  {copied ? "Copied" : "Copy"}
                </FormButton>
              </div>
              {copied ? (
                <Alert intent="success">Follow up copied to clipboard.</Alert>
              ) : null}
              {copyError ? <Alert intent="error">{copyError}</Alert> : null}
              <div className="rounded-2xl border border-white/10 bg-slate-950 p-4 text-sm text-slate-100 whitespace-pre-wrap">
                {followUp.content}
              </div>
              {followUpWarningFlags.length ? (
                <ComplianceFlagPanel
                  title="Compliance warnings"
                  description="Follow up copy includes compliance notices."
                  flags={followUpWarningFlags}
                  auditId={followUpAuditId}
                  baselineVersionHash={followUpBaselineHash}
                  intent="warning"
                />
              ) : null}
            </div>
          ) : null}

          {!selectedJobId ? (
            <EmptyState
              title="Select a job"
              body="Pick a saved job to enable follow ups."
              className="max-w-full border border-dashed border-white/20 bg-transparent px-4 py-6 shadow-none text-slate-400"
            />
          ) : null}
        </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              Recommended resources
            </p>
            <h2 className="text-lg font-semibold text-slate-100">Resources</h2>
          </div>
          <p className="text-sm text-slate-300">
            Curated articles, videos, and tools that reinforce your prep for the
            selected opportunity.
          </p>
          {resources.length > 0 ? (
            <ResourcesList resources={resources} />
          ) : (
            <EmptyState
              title="No study packet"
              body="Select a job to build its study packet."
              className="max-w-full border border-dashed border-white/20 bg-transparent px-4 py-6 shadow-none text-slate-400"
            />
          )}
          <div className="text-xs text-slate-400">
            Need additional references?{" "}
            <Link
              href={
                selectedJobId
                  ? `/interview-toolkit/resources?jobId=${encodeURIComponent(
                      selectedJobId,
                    )}`
                  : "/interview-toolkit/resources"
              }
              className="text-sky-300 underline"
            >
              Add resources later
            </Link>
            .
          </div>
        </section>

        <div className="text-xs text-slate-400">
          Need STAR stories?{" "}
          <Link
            href="/interview-toolkit/star-stories"
            className="text-sky-300 underline"
          >
            Manage your STAR stories
          </Link>
          .
        </div>
      </div>
    </PageShell>
  );
}
