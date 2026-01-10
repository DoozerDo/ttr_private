"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/Alert";
import { FormButton } from "@/components/FormButton";
import { PageHeader } from "@/components/PageHeader";
import {
  RealityCheckAnswer,
  RealityCheckDto,
  RealityCheckOutcome,
  RealityCheckQuestion,
  generateRealityCheckQuestions,
  getRealityCheck,
  submitRealityCheck,
} from "@/lib/realityCheck";

const MULTI_SELECT_LIMIT = 8;

type AnswerMap = Record<string, RealityCheckAnswer>;

const buildAnswerMap = (answers: RealityCheckAnswer[], questions: RealityCheckQuestion[] = []) => {
  const map: AnswerMap = {};
  answers.forEach((answer) => {
    map[answer.questionId] = answer;
  });

  questions.forEach((question) => {
    if (!map[question.id] && question.type === "multi_select") {
      map[question.id] = { questionId: question.id, type: question.type, value: [] };
    }
  });

  return map;
};

type RealityCheckClientProps = {
  jobId: string;
  baselineId: string | null;
};

export function RealityCheckClient({ jobId, baselineId }: RealityCheckClientProps) {
  const router = useRouter();
  const [questions, setQuestions] = useState<RealityCheckQuestion[]>([]);
  const [answerMap, setAnswerMap] = useState<AnswerMap>({});
  const [realityCheck, setRealityCheck] = useState<RealityCheckDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingQuestions, setFetchingQuestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hasBaseline = Boolean(baselineId?.trim());
  const hasJob = Boolean(jobId?.trim());

  useEffect(() => {
    if (!hasJob || !hasBaseline) {
      setQuestions([]);
      setAnswerMap({});
      setRealityCheck(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadRealityCheck = async () => {
      setLoading(true);
      setError(null);
      setRealityCheck(null);
      setQuestions([]);
      setAnswerMap({});

      try {
        const existing = await getRealityCheck(jobId, baselineId!);
        if (cancelled) return;

        if (existing) {
          setRealityCheck(existing);
          setQuestions(existing.questions);
          setAnswerMap(buildAnswerMap(existing.answers, existing.questions));
          return;
        }

        await fetchQuestionSet();
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unable to load Reality Check";
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadRealityCheck();
    return () => {
      cancelled = true;
    };
  }, [jobId, baselineId, hasBaseline, hasJob]);

  const fetchQuestionSet = async () => {
    if (!hasJob || !hasBaseline) return;
    setFetchingQuestions(true);
    setError(null);
    try {
      const payload = await generateRealityCheckQuestions(jobId, baselineId!);
      setQuestions(payload.questions);
      setAnswerMap(buildAnswerMap([], payload.questions));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load questions";
      setError(message);
    } finally {
      setFetchingQuestions(false);
    }
  };

  const handleBoolean = (questionId: string, value: boolean) => {
    setAnswerMap((prev) => ({
      ...prev,
      [questionId]: { questionId, type: "boolean", value },
    }));
  };

  const handleSingleSelect = (questionId: string, option: string) => {
    setAnswerMap((prev) => ({
      ...prev,
      [questionId]: { questionId, type: "single_select", value: option },
    }));
  };

  const toggleMultiSelect = (questionId: string, option: string) => {
    setAnswerMap((prev) => {
      const existing = Array.isArray(prev[questionId]?.value) ? prev[questionId].value : [];
      const selected = existing.filter((value) => value !== option);
      const isAlreadySelected = existing.includes(option);

      if (isAlreadySelected) {
        return {
          ...prev,
          [questionId]: { questionId, type: "multi_select", value: selected },
        };
      }

      if (existing.length >= MULTI_SELECT_LIMIT) {
        return prev;
      }

      return {
        ...prev,
        [questionId]: {
          questionId,
          type: "multi_select",
          value: [...existing, option],
        },
      };
    });
  };

  const allQuestionsAnswered = useMemo(() => {
    if (!questions.length) return false;
    return questions.every((question) => {
      const answer = answerMap[question.id];
      if (!answer) return false;
      if (question.type === "boolean") {
        return typeof answer.value === "boolean";
      }
      if (question.type === "single_select") {
        return typeof answer.value === "string" && answer.value.length > 0;
      }
      return Array.isArray(answer.value);
    });
  }, [questions, answerMap]);

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const answers = Object.values(answerMap);
      const saved = await submitRealityCheck(jobId, baselineId!, answers);
      setRealityCheck(saved);
      setQuestions(saved.questions);
      setAnswerMap(buildAnswerMap(saved.answers, saved.questions));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to submit Reality Check";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const outcome = realityCheck?.outcome ?? null;
  const triggeredBy = realityCheck?.triggeredBy ?? [];
  const suggestedSections = realityCheck?.suggestedBaselineSections ?? [];

  const handleSkipReview = () => {
    const note = `Skipped Reality Check updates at ${new Date().toLocaleString()}`;
    sessionStorage.setItem("ttr:realityCheckSkipNote", note);
    router.push("/results?realityCheckSkipped=1");
  };

  const triggerSummary =
    triggeredBy.length > 0 ? (
      <ul className="space-y-1 text-sm text-slate-100">
        {triggeredBy.map((fragment) => (
          <li key={fragment} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            {fragment}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-slate-300">
        We will surface triggered gaps once you answer the questions below.
      </p>
    );

  const outcomePanel = outcome ? (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-6">
      <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Outcome</h3>
      {outcome === RealityCheckOutcome.VALID ? (
        <>
          <p className="text-base font-semibold text-slate-100">
            Baseline appears current. Proceed to generation.
          </p>
          <div className="flex flex-wrap gap-3">
            <FormButton
              onClick={() =>
                router.push(
                  `/results?jobId=${encodeURIComponent(jobId)}&baselineId=${encodeURIComponent(
                    baselineId ?? "",
                  )}`,
                )
              }
            >
              Return to Results
            </FormButton>
            <FormButton
              variant="secondary"
              onClick={() => router.push(`/results?jobId=${encodeURIComponent(jobId)}`)}
            >
              Open Results to generate
            </FormButton>
          </div>
        </>
      ) : outcome === RealityCheckOutcome.UPDATE_RECOMMENDED ? (
        <>
          <p className="text-base font-semibold text-slate-100">
            Baseline may be outdated. Updating it prevents underrepresentation.
          </p>
          <div className="flex flex-wrap gap-3">
            <FormButton
              onClick={() =>
                router.push(
                  `/baseline/${baselineId}?jobId=${encodeURIComponent(
                    jobId,
                  )}&suggestedSections=${encodeURIComponent(suggestedSections.join(","))}`,
                )
              }
            >
              Review baseline update suggestions
            </FormButton>
            <FormButton variant="secondary" onClick={handleSkipReview}>
              Skip and proceed anyway
            </FormButton>
          </div>
        </>
      ) : (
        <>
          <p className="text-base font-semibold text-slate-100">
            This role requires experience not supported by your current baseline. Rewriting will
            not resolve this gap.
          </p>
          <div className="flex flex-wrap gap-3">
            <FormButton onClick={() => router.push(`/fit-review?jobId=${encodeURIComponent(jobId)}`)}>
              View Fit Review
            </FormButton>
            <FormButton variant="secondary" onClick={() => router.push("/applications")}>
              Back to Job Tracker
            </FormButton>
          </div>
        </>
      )}
    </section>
  ) : (
    <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-6">
      <p className="text-sm text-slate-300">Answer the questions to see whether your baseline is current.</p>
    </section>
  );

  if (!hasJob || !hasBaseline) {
    return (
      <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/40 p-6">
        <PageHeader
          title="Reality Check"
          description="Before we generate outputs, confirm your baseline still reflects reality."
        />
        <Alert intent="warning">
          A job and baseline are required to run Reality Check. Upload a baseline or load an analysis
          before continuing.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-2xl border border-white/10 bg-slate-900/40 p-6 shadow-lg">
      <PageHeader
        title="Reality Check"
        description="Before we generate outputs, confirm your baseline still reflects reality."
      />
      {error ? (
        <Alert intent="error" title="Unable to load Reality Check">
          <p>{error}</p>
        </Alert>
      ) : null}
      <section className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/60 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Trigger summary</h3>
        {loading || fetchingQuestions ? (
          <p className="text-sm text-slate-400">Loading signals…</p>
        ) : (
          triggerSummary
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/50 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Questions</h3>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            {questions.length ? questions.length : "0"} questions
          </p>
        </div>
        {(!questions.length && !loading && !fetchingQuestions) || loading ? (
          <p className="text-sm text-slate-400">Preparing questions…</p>
        ) : (
          <div className="space-y-6">
            {questions.map((question) => {
              const answer = answerMap[question.id];
              const selectedMulti = Array.isArray(answer?.value) ? answer.value : [];

              return (
                <div key={question.id} className="space-y-3">
                  <p className="text-sm font-semibold text-slate-100">{question.prompt}</p>
                  {question.type === "boolean" ? (
                    <div className="flex flex-wrap gap-3">
                      {["Yes", "No"].map((label) => {
                        const value = label === "Yes";
                        return (
                          <label
                            key={label}
                            className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                              answer?.value === value
                                ? "border-amber-400 bg-amber-400/20 text-amber-100"
                                : "border-white/10 bg-transparent text-slate-100 hover:border-white/30"
                            }`}
                          >
                            <input
                              type="radio"
                              name={question.id}
                              className="hidden"
                              checked={answer?.value === value}
                              value={String(value)}
                              onChange={() => handleBoolean(question.id, value)}
                            />
                            {label}
                          </label>
                        );
                      })}
                    </div>
                  ) : question.type === "single_select" ? (
                    <div className="flex flex-col gap-2">
                      {question.options?.map((option) => (
                        <label
                          key={option.value}
                          className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                            answer?.value === option.value
                              ? "border-amber-400 bg-amber-400/20 text-amber-100"
                              : "border-white/10 bg-transparent text-slate-100 hover:border-white/30"
                          }`}
                        >
                          <input
                            type="radio"
                            name={question.id}
                            className="hidden"
                            checked={answer?.value === option.value}
                            onChange={() => handleSingleSelect(question.id, option.value)}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-3">
                        {question.options?.map((option) => {
                          const alreadySelected = selectedMulti.includes(option.value);
                          const disableAdding =
                            !alreadySelected && selectedMulti.length >= MULTI_SELECT_LIMIT;
                          return (
                            <label
                              key={option.value}
                              className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                                alreadySelected
                                  ? "border-amber-400 bg-amber-400/20 text-amber-100"
                                  : "border-white/10 bg-transparent text-slate-100 hover:border-white/30"
                              } ${disableAdding ? "opacity-60 cursor-not-allowed" : ""}`}
                            >
                              <input
                                type="checkbox"
                                className="hidden"
                                checked={alreadySelected}
                                disabled={disableAdding}
                                onChange={() => toggleMultiSelect(question.id, option.value)}
                              />
                              {option.label}
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-xs text-slate-400">
                        Selected {selectedMulti.length}/{MULTI_SELECT_LIMIT}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Submit</h3>
          <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
            {allQuestionsAnswered ? "Ready" : "Incomplete"}
          </span>
        </div>
        {submitError ? (
          <Alert intent="error" title="Submission failed">
            <p>{submitError}</p>
          </Alert>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <FormButton onClick={handleSubmit} disabled={!allQuestionsAnswered || submitting}>
            {submitting ? "Submitting…" : "Submit answers"}
          </FormButton>
          <FormButton variant="secondary" onClick={fetchQuestionSet} disabled={fetchingQuestions || submitting}>
            Refresh questions
          </FormButton>
        </div>
      </section>

      {outcomePanel}
    </div>
  );
}
