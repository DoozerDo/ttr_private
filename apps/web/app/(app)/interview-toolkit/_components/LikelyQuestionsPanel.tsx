"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/Alert";
import {
  INTERVIEW_QUESTION_GROUP_ORDER,
  transformSignalsToInterviewQuestions,
  type DiagnosticSignal,
  type InterviewQuestion,
  type InterviewQuestionGroup,
} from "@/lib/interviewToolkit/questions";

const TIME_MODES = [
  { value: "5", label: "5 minutes", limit: 3 },
  { value: "15", label: "15 minutes", limit: 6 },
  { value: "30", label: "30 minutes", limit: Infinity },
] as const;

type TimeModeValue = (typeof TIME_MODES)[number]["value"];

const createInitialGroupState = (): Record<InterviewQuestionGroup, boolean> =>
  INTERVIEW_QUESTION_GROUP_ORDER.reduce((acc, group) => {
    acc[group] = false;
    return acc;
  }, {} as Record<InterviewQuestionGroup, boolean>);

interface LikelyQuestionsPanelProps {
  signals: Array<string | DiagnosticSignal | null | undefined>;
}

export function LikelyQuestionsPanel({ signals }: LikelyQuestionsPanelProps) {
  const questions = useMemo(() => transformSignalsToInterviewQuestions(signals), [signals]);
  const signalFingerprint = useMemo(
    () =>
      signals
        .map((signal) => {
          if (!signal) return "";
          return typeof signal === "string" ? signal : signal.signalLabel;
        })
        .join("|"),
    [signals],
  );

  const [timeMode, setTimeMode] = useState<TimeModeValue>("15");
  const [showMore, setShowMore] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(createInitialGroupState);
  const [pinnedQuestionIds, setPinnedQuestionIds] = useState<string[]>([]);
  const [copiedQuestionId, setCopiedQuestionId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    setExpandedGroups(createInitialGroupState());
    setPinnedQuestionIds([]);
    setShowMore(false);
    setCopiedQuestionId(null);
    setCopyError(null);
  }, [signalFingerprint]);

  useEffect(() => {
    if (timeMode !== "30") {
      setShowMore(false);
    }
  }, [timeMode]);

  const activeMode = TIME_MODES.find((mode) => mode.value === timeMode) ?? TIME_MODES[1];
  const shouldShowAll = timeMode === "30" || showMore;
  const visibleQuestions = shouldShowAll ? questions : questions.slice(0, activeMode.limit);
  const hiddenCount = Math.max(0, questions.length - visibleQuestions.length);

  const groupedQuestions = INTERVIEW_QUESTION_GROUP_ORDER.map((group) => {
    const groupTotal = questions.filter((question) => question.group === group).length;
    return {
      group,
      visible: visibleQuestions.filter((question) => question.group === group),
      total: groupTotal,
    };
  }).filter((item) => item.total > 0);

  const pinnedQuestions = pinnedQuestionIds
    .map((id) => questions.find((question) => question.signalId === id))
    .filter(Boolean) as InterviewQuestion[];

  const toggleGroup = (group: InterviewQuestionGroup) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const togglePin = (questionId: string) => {
    setPinnedQuestionIds((prev) => {
      if (prev.includes(questionId)) {
        return prev.filter((id) => id !== questionId);
      }
      return [...prev, questionId];
    });
  };

  const handleCopy = async (question: InterviewQuestion) => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setCopyError("clipboard access is not available.");
      return;
    }

    try {
      await navigator.clipboard.writeText(question.primary);
      setCopyError(null);
      setCopiedQuestionId(question.signalId);
      setTimeout(() => {
        setCopiedQuestionId((current) => (current === question.signalId ? null : current));
      }, 1200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to copy question text.";
      setCopyError(message);
    }
  };

  const QuestionCard = ({
    question,
    variant,
  }: {
    question: InterviewQuestion;
    variant?: "default" | "compact";
  }) => {
    const isPinned = pinnedQuestionIds.includes(question.signalId);

    return (
      <div
        className={`rounded-2xl border border-white/10 bg-slate-900/50 p-4 ${
          variant === "compact" ? "space-y-2" : "space-y-3"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="font-semibold text-white">{question.primary}</p>
            {question.followUp ? (
              <p className="text-xs text-slate-400">
                Follow-up: {question.followUp}
              </p>
            ) : null}
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-400"
              title={question.reason}
            >
              Why this question is included
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {question.focusFirst ? (
              <span className="rounded-full border border-sky-500/60 bg-sky-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-sky-300">
                Focus first
              </span>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  isPinned
                    ? "border-sky-500 text-sky-300"
                    : "border-white/20 text-slate-200 hover:border-white/40"
                }`}
                aria-pressed={isPinned}
                onClick={() => togglePin(question.signalId)}
              >
                {isPinned ? "Pinned" : "Pin"}
              </button>
              <button
                type="button"
                className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-white/40"
                onClick={() => handleCopy(question)}
              >
                Copy
              </button>
            </div>
            {copiedQuestionId === question.signalId ? (
              <span className="text-[10px] uppercase tracking-[0.3em] text-sky-300">
                Copied!
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const pinnedSection = (
    <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          My prep list
        </p>
        <span className="text-[10px] text-slate-400">
          {pinnedQuestions.length} pinned
        </span>
      </div>
      {pinnedQuestions.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          Pin a question to build a quick prep checklist.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {pinnedQuestions.map((question) => (
            <QuestionCard key={question.signalId} question={question} variant="compact" />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
            Likely questions
          </p>
          <p className="text-lg font-semibold text-white">
            Prepare for the gaps the analyzer surfaced
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TIME_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                timeMode === mode.value
                  ? "border-sky-500 bg-slate-900 text-white"
                  : "border-white/20 text-slate-300 hover:border-white/40"
              }`}
              onClick={() => setTimeMode(mode.value)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>
      {copyError ? <Alert intent="error">{copyError}</Alert> : null}
      {!questions.length ? (
        <Alert intent="warning">
          No interview signals were detected yet. Run Analyze or Fit Review to surface likely
          questions.
        </Alert>
      ) : (
        <div className="space-y-3">
          {groupedQuestions.map(({ group, visible, total }) => (
            <div key={group} className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                    {group}
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {total} question{total !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 underline decoration-dotted underline-offset-4"
                  onClick={() => toggleGroup(group)}
                  aria-expanded={expandedGroups[group]}
                >
                  {expandedGroups[group] ? "Collapse" : "Expand"}
                </button>
              </div>
              {expandedGroups[group] ? (
                visible.length ? (
                  <div className="mt-4 space-y-3">
                    {visible.map((question) => (
                      <QuestionCard key={question.signalId} question={question} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-slate-400">
                    {shouldShowAll
                      ? "No additional questions in this theme."
                      : "Switch to a longer time mode or tap Show more to view these questions."}
                  </p>
                )
              ) : null}
            </div>
          ))}
          {hiddenCount > 0 && timeMode !== "30" ? (
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-full border border-white/20 px-4 py-1 text-xs font-semibold text-slate-200 hover:border-white/40"
                onClick={() => setShowMore(true)}
              >
                Show {hiddenCount} more question{hiddenCount !== 1 ? "s" : ""}
              </button>
            </div>
          ) : null}
        </div>
      )}
      {pinnedSection}
    </div>
  );
}
