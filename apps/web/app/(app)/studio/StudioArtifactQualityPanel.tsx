"use client";

import type { ArtifactClaimRef, ArtifactConfidence, ArtifactQualityModel } from "@/lib/artifactConfidence";

type Props = {
  model: ArtifactQualityModel | null;
  confidence: ArtifactConfidence;
  onVerifyClaim: (claim: ArtifactClaimRef) => void;
  onEditClaim: (claim: ArtifactClaimRef) => void;
  onDismissClaim: (claim: ArtifactClaimRef) => void;
};

function confidenceCopy(confidence: ArtifactConfidence) {
  if (confidence === "HIGH") {
    return {
      badge: "Strong Output",
      subtext: "Built from verified experience",
      panelTone: "border-emerald-300/25 bg-emerald-500/10",
      badgeTone: "bg-emerald-500/15 text-emerald-100 border-emerald-300/30",
    };
  }
  if (confidence === "MEDIUM") {
    return {
      badge: "Usable Output",
      subtext: "Some claims are unverified. Strengthen for best results.",
      panelTone: "border-amber-300/25 bg-amber-500/10",
      badgeTone: "bg-amber-500/15 text-amber-50 border-amber-300/30",
    };
  }
  return {
    badge: "Output needs work",
    subtext: "Evidence support is still light. Strengthen the baseline to improve reliability.",
    panelTone: "border-slate-300/20 bg-slate-500/10",
    badgeTone: "bg-slate-500/15 text-slate-50 border-slate-300/20",
  };
}

function titleCaseConfidence(confidence: ArtifactConfidence): string {
  return confidence.charAt(0) + confidence.slice(1).toLowerCase();
}

function resolveDraftQualityLabel(score: number): "High" | "Medium" | "Low" {
  if (score >= 85) return "High";
  if (score >= 70) return "Medium";
  return "Low";
}

export function StudioArtifactQualityPanel({ model, confidence, onVerifyClaim, onEditClaim, onDismissClaim }: Props) {
  if (!model) return null;

  const copy = confidenceCopy(confidence);
  const draftQuality = resolveDraftQualityLabel(model.artifactScore);

  return (
    <section
      className={`space-y-4 rounded-2xl border p-4 shadow-sm ${copy.panelTone}`}
      data-testid="studio-artifact-quality-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.24em] uppercase ${copy.badgeTone}`}>
            {copy.badge}
          </div>
          <p className="text-sm text-slate-100">{copy.subtext}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Draft quality</p>
          <p className="text-2xl font-semibold text-slate-50">{draftQuality}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm text-slate-200">
        <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1">
          {model.missingEvidenceCount} claims can be strengthened
        </span>
        <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1">
          Evidence confidence: {titleCaseConfidence(confidence)}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-50">Improve this output</h2>
            <p className="text-sm text-slate-300">
              Verify the weakest claims to raise artifact quality and reduce uncertainty.
            </p>
          </div>
        </div>

        {model.improvableClaims.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {model.improvableClaims.map((claim) => (
              <article
                key={claim.id}
                className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                data-testid="improvable-claim-card"
              >
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-50">{claim.text}</p>
                  <p className="text-sm text-slate-300">Not backed by verified evidence.</p>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Source baseline item</p>
                  <p className="text-sm text-slate-200">{claim.baselineItem}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onVerifyClaim(claim)}
                    className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                  >
                    Verify this
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditClaim(claim)}
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06]"
                  >
                    Edit before verifying
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismissClaim(claim)}
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
                  >
                    Dismiss
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm text-slate-300">
            No specific claims need attention right now.
          </div>
        )}
      </div>
    </section>
  );
}
