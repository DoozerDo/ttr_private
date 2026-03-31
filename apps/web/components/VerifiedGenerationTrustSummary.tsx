type VerifiedGenerationTrustSummaryProps = {
  testId: string;
};

export function VerifiedGenerationTrustSummary({ testId }: VerifiedGenerationTrustSummaryProps) {
  return (
    <div
      className="rounded-xl border border-emerald-400/25 bg-emerald-500/8 px-3 py-2 text-xs text-emerald-50"
      data-testid={testId}
    >
      <p className="font-semibold uppercase tracking-[0.18em]">Generated from verified evidence</p>
      <p className="mt-1 text-emerald-50/80">
        Verified baseline used. Aligned to this role. Unsupported claims remain blocked.
      </p>
    </div>
  );
}
