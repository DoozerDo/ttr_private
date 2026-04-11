import type { BaselineDto } from "@/lib/baselines";
import type { SignalGraphViewModel } from "@/lib/professionalSignals";
import {
  FALLBACK_RENDERED_TEXT,
  sanitizeRenderedTextList,
  sanitizeRenderedTextValue,
} from "@/lib/renderedText";

export type BaselineCertificationStatus = "not_ready" | "not_certified" | "certified";

export type BaselineCertificationViewModel = {
  status: BaselineCertificationStatus;
  title: string;
  summary: string;
  detail: string;
  supportingPoints: string[];
  checklist: Array<{ label: string; value: string; complete: boolean }>;
  isCertified: boolean;
};

type BuildBaselineCertificationInput = {
  baseline: BaselineDto | null;
  signalGraph: SignalGraphViewModel;
  baselineStrengthPercent: number;
  analysisStatus: "not_analyzed" | "loading" | "ready" | "failed";
  analysesCompleted: number;
};

function countSectionsByType(baseline: BaselineDto | null) {
  const sections = baseline?.sections ?? [];
  return {
    total: sections.length,
    experience: sections.filter((section) => section.sectionType === "EXPERIENCE").length,
    summary: sections.filter((section) => section.sectionType === "SUMMARY").length,
    skills: sections.filter((section) => section.sectionType === "SKILLS").length,
  };
}

function hasRoleTitleData(baseline: BaselineDto | null) {
  const sections = baseline?.sections ?? [];
  return sections.some((section) => {
    const title = sanitizeRenderedTextValue(section.title ?? "", {
      endpoint: "baseline-certification",
      field: "section.title",
    }).toLowerCase();
    const content = sanitizeRenderedTextValue(section.content ?? "", {
      endpoint: "baseline-certification",
      field: "section.content",
    }).toLowerCase();
    return (
      /manager|director|lead|head|vp|chief|owner|administrator|specialist|analyst|engineer/.test(title) ||
      /as\s+(a|an)\s+[a-z]/.test(content) ||
      /role|title/.test(content)
    );
  });
}

function hasTimelineData(baseline: BaselineDto | null) {
  const lines = (baseline?.sections ?? []).flatMap((section) => [
    sanitizeRenderedTextValue(section.title ?? "", {
      endpoint: "baseline-certification",
      field: "section.title",
    }),
    sanitizeRenderedTextValue(section.content ?? "", {
      endpoint: "baseline-certification",
      field: "section.content",
    }),
  ]);
  return lines.some((line) => /20\d{2}|19\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(line));
}

export type CareerGravityUnlockViewModel = {
  unlocked: boolean;
  completed: number;
  required: number;
  progressText: string;
};

export function buildCareerGravityUnlock(completedRoleAnalyses: number): CareerGravityUnlockViewModel {
  const required = 3;
  const completed = Math.max(0, completedRoleAnalyses);
  return {
    unlocked: completed >= required,
    completed,
    required,
    progressText: `${Math.min(completed, required)} of ${required} completed`,
  };
}

function sanitizeOutput(value: string, field: string): string {
  const sanitized = sanitizeRenderedTextValue(value, {
    endpoint: "baseline-certification",
    field,
  });
  return sanitized === FALLBACK_RENDERED_TEXT ? value : sanitized;
}

export function buildBaselineCertification(
  input: BuildBaselineCertificationInput,
): BaselineCertificationViewModel {
  if (input.analysisStatus !== "ready" || !input.baseline?.sections?.length) {
    return {
      status: "not_ready",
      title: sanitizeOutput("Certification Pending", "title"),
      summary: sanitizeOutput("Determine baseline strength to evaluate certification.", "summary"),
      detail: sanitizeOutput(
        "Certification becomes available once the current primary resume has enough analyzed baseline evidence.",
        "detail",
      ),
      supportingPoints: [
        sanitizeOutput("Analysis is required before certification can be evaluated.", "supportingPoints[0]"),
      ],
      checklist: [
        { label: "Strong signals", value: "0, minimum 5 required", complete: false },
        { label: "Signals detected", value: "0, minimum 7 required", complete: false },
        { label: "Developing signals", value: "0, maximum 2 allowed", complete: false },
        { label: "Quantified impact", value: "Missing", complete: false },
        { label: "Analyses completed", value: "0 of 2 required", complete: false },
      ],
      isCertified: false,
    };
  }

  const sections = countSectionsByType(input.baseline);
  const hasStructure = sections.experience >= 1 && hasRoleTitleData(input.baseline) && hasTimelineData(input.baseline);
  const signalCoverageMet =
    input.signalGraph.identifiedSignalCount >= 7 &&
    input.signalGraph.strongSignalCount >= 5 &&
    input.signalGraph.developingSignalCount <= 2;
  const analysesMature = input.analysesCompleted >= 2;
  const isCertified =
    hasStructure &&
    signalCoverageMet &&
    input.signalGraph.hasQuantifiedImpactSignal &&
    analysesMature &&
    !input.signalGraph.fallbackUsed;

  const checklist: BaselineCertificationViewModel["checklist"] = [
    {
      label: sanitizeOutput("Strong signals", "checklist[0].label"),
      value: sanitizeOutput(`${input.signalGraph.strongSignalCount}, minimum 5 required`, "checklist[0].value"),
      complete: input.signalGraph.strongSignalCount >= 5,
    },
    {
      label: sanitizeOutput("Signals detected", "checklist[1].label"),
      value: sanitizeOutput(
        `${input.signalGraph.identifiedSignalCount}, minimum 7 required`,
        "checklist[1].value",
      ),
      complete: input.signalGraph.identifiedSignalCount >= 7,
    },
    {
      label: sanitizeOutput("Developing signals", "checklist[2].label"),
      value: sanitizeOutput(
        `${input.signalGraph.developingSignalCount}, maximum 2 allowed`,
        "checklist[2].value",
      ),
      complete: input.signalGraph.developingSignalCount <= 2,
    },
    {
      label: sanitizeOutput("Quantified impact", "checklist[3].label"),
      value: sanitizeOutput(input.signalGraph.hasQuantifiedImpactSignal ? "Ready" : "Missing", "checklist[3].value"),
      complete: input.signalGraph.hasQuantifiedImpactSignal,
    },
    {
      label: sanitizeOutput("Analyses completed", "checklist[4].label"),
      value: sanitizeOutput(`${input.analysesCompleted} of 2 required`, "checklist[4].value"),
      complete: analysesMature,
    },
  ];

  if (isCertified) {
    return {
      status: "certified",
      title: sanitizeOutput("CERTIFIED BASELINE", "certified.title"),
      summary: sanitizeOutput("Trusted for stronger scoring and personalized documents.", "certified.summary"),
      detail: sanitizeOutput(
        "Your baseline now meets the trust threshold for stronger scoring and document generation.",
        "certified.detail",
      ),
      supportingPoints: [
        sanitizeOutput("Structural baseline parsing is complete.", "certified.supportingPoints[0]"),
        sanitizeOutput("Signal coverage and quantification thresholds are met.", "certified.supportingPoints[1]"),
      ],
      checklist,
      isCertified: true,
    };
  }

  const supportingPoints: string[] = [];
  if (!hasStructure) {
    supportingPoints.push(sanitizeOutput("Complete role/title and timeline parsing is required.", "supportingPoints[0]"));
  }
  if (!signalCoverageMet || input.signalGraph.fallbackUsed) {
    supportingPoints.push(
      sanitizeOutput("Professional signals need clearer evidence before certification.", "supportingPoints[1]"),
    );
  }
  if (!input.signalGraph.hasQuantifiedImpactSignal) {
    supportingPoints.push(
      sanitizeOutput("Add measurable outcomes to unlock quantified impact readiness.", "supportingPoints[2]"),
    );
  }
  if (!analysesMature) {
    supportingPoints.push(
      sanitizeOutput("Complete one more analysis cycle to reach maturity threshold.", "supportingPoints[3]"),
    );
  }

  return {
    status: "not_certified",
    title: sanitizeOutput("CERTIFICATION IN PROGRESS", "not_certified.title"),
    summary: sanitizeOutput(
      "Strengthen your baseline signals to unlock higher-confidence scoring and more personalized documents.",
      "not_certified.summary",
    ),
    detail: sanitizeOutput(
      "This primary baseline is usable, but the current analysis does not yet provide enough trusted signal coverage for certification.",
      "not_certified.detail",
    ),
    supportingPoints:
      supportingPoints.length > 0
        ? supportingPoints.slice(0, 3)
        : [sanitizeOutput("Signal clarity is still forming across the selected resume.", "supportingPoints.fallback")],
    checklist,
    isCertified: false,
  };
}
