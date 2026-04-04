type ResumeWithBaselineStatusProps = {
  filename: string;
  isActiveBaseline?: boolean;
  isValidated?: boolean;
  isReadyForTargeting?: boolean;
  isSourceForActiveBaseline?: boolean;
};

export function ResumeWithBaselineStatus({
  filename,
  isActiveBaseline = false,
  isValidated = false,
  isReadyForTargeting = false,
  isSourceForActiveBaseline = false,
}: ResumeWithBaselineStatusProps) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-slate-100">{filename}</p>
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em]">
        {isValidated ? (
          <span className="rounded-full border border-cyan-300/15 px-2.5 py-0.5 text-cyan-100">
            Validated baseline
          </span>
        ) : null}
        {isReadyForTargeting ? (
          <span className="rounded-full border border-emerald-300/15 px-2.5 py-0.5 text-emerald-100">
            Ready for targeting
          </span>
        ) : null}
        {isActiveBaseline && !isValidated ? (
          <span className="rounded-full border border-cyan-300/15 px-2.5 py-0.5 text-cyan-100">
            Active baseline
          </span>
        ) : null}
        {isSourceForActiveBaseline ? (
          <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-slate-300">
            Used to create active baseline
          </span>
        ) : null}
      </div>
    </div>
  );
}
