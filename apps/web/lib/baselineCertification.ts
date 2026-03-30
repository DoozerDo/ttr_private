import type { BaselineDto } from "@/lib/baselines";
import type { SignalGraphViewModel } from "@/lib/professionalSignals";

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
    const title = (section.title ?? "").toLowerCase();
    const content = section.content.toLowerCase();
    return (
      /manager|director|lead|head|vp|chief|owner|administrator|specialist|analyst|engineer/.test(title) ||
      /as\s+(a|an)\s+[a-z]/.test(content) ||
      /role|title/.test(content)
    );
  });
}

function hasTimelineData(baseline: BaselineDto | null) {
  const lines = (baseline?.sections ?? []).flatMap((section) => [section.title ?? "", section.content]);
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

export function buildBaselineCertification(
  input: BuildBaselineCertificationInput,
): BaselineCertificationViewModel {
  if (input.analysisStatus !== "ready" || !input.baseline?.sections?.length) {
    return {
      status: "not_ready",
      title: "Certification Pending",
      summary: "Determine baseline strength to evaluate certification.",
      detail:
        "Certification becomes available once the current primary resume has enough analyzed baseline evidence.",
      supportingPoints: [
        "Analysis is required before certification can be evaluated.",
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
      label: "Strong signals",
      value: `${input.signalGraph.strongSignalCount}, minimum 5 required`,
      complete: input.signalGraph.strongSignalCount >= 5,
    },
    {
      label: "Signals detected",
      value: `${input.signalGraph.identifiedSignalCount}, minimum 7 required`,
      complete: input.signalGraph.identifiedSignalCount >= 7,
    },
    {
      label: "Developing signals",
      value: `${input.signalGraph.developingSignalCount}, maximum 2 allowed`,
      complete: input.signalGraph.developingSignalCount <= 2,
    },
    {
      label: "Quantified impact",
      value: input.signalGraph.hasQuantifiedImpactSignal ? "Ready" : "Missing",
      complete: input.signalGraph.hasQuantifiedImpactSignal,
    },
    {
      label: "Analyses completed",
      value: `${input.analysesCompleted} of 2 required`,
      complete: analysesMature,
    },
  ];

  if (isCertified) {
    return {
      status: "certified",
      title: "CERTIFIED BASELINE",
      summary: "Trusted for stronger scoring and personalized documents.",
      detail:
        "Your baseline now meets the trust threshold for stronger scoring and document generation.",
      supportingPoints: [
        "Structural baseline parsing is complete.",
        "Signal coverage and quantification thresholds are met.",
      ],
      checklist,
      isCertified: true,
    };
  }

  const supportingPoints: string[] = [];
  if (!hasStructure) {
    supportingPoints.push("Complete role/title and timeline parsing is required.");
  }
  if (!signalCoverageMet || input.signalGraph.fallbackUsed) {
    supportingPoints.push("Professional signals need clearer evidence before certification.");
  }
  if (!input.signalGraph.hasQuantifiedImpactSignal) {
    supportingPoints.push("Add measurable outcomes to unlock quantified impact readiness.");
  }
  if (!analysesMature) {
    supportingPoints.push("Complete one more analysis cycle to reach maturity threshold.");
  }

  return {
    status: "not_certified",
    title: "CERTIFICATION IN PROGRESS",
    summary: "Strengthen your baseline signals to unlock higher-confidence scoring and more personalized documents.",
    detail:
      "This primary baseline is usable, but the current analysis does not yet provide enough trusted signal coverage for certification.",
    supportingPoints:
      supportingPoints.length > 0
        ? supportingPoints.slice(0, 3)
        : ["Signal clarity is still forming across the selected resume."],
    checklist,
    isCertified: false,
  };
}
