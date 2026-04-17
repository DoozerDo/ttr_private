type ResumeWithBaselineStatusProps = {
  filename: string;
  isActiveBaseline?: boolean;
  isReadyForTargeting?: boolean;
  showNeedsReviewBadge?: boolean;
};

export function ResumeWithBaselineStatus({
  filename,
  isActiveBaseline = false,
  isReadyForTargeting = false,
  showNeedsReviewBadge = false,
}: ResumeWithBaselineStatusProps) {
  const shouldShowNeedsReview = showNeedsReviewBadge && !isReadyForTargeting;
  const shouldShowCurrent = isActiveBaseline;
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-slate-100">{filename}</p>
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em]">
        {isReadyForTargeting ? (
          <span className="rounded-full border border-emerald-300/15 px-2.5 py-0.5 text-emerald-100">
            Ready for targeting
          </span>
        ) : null}
        {shouldShowCurrent ? (
          <span className="rounded-full border border-cyan-300/15 px-2.5 py-0.5 text-cyan-100">
            Current
          </span>
        ) : null}
        {shouldShowNeedsReview ? (
          <span className="rounded-full border border-amber-300/15 px-2.5 py-0.5 text-amber-100">
            Needs review
          </span>
        ) : null}
      </div>
    </div>
  );
}
