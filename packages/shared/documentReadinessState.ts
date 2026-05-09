export type DocumentReadinessState =
  | 'ready'
  | 'needs_refinement'
  | 'generated_unusable'
  | 'failed'
  | 'missing';

type QualityGateLike = { status?: unknown; reasons?: unknown };

type ArtifactLike = {
  exportReady?: unknown;
  generationState?: unknown;
  qualityGate?: QualityGateLike | null;
  correctionReasons?: Array<{ code?: unknown; message?: unknown }> | null;
  qualityStatus?: unknown;
};

function toText(value: unknown): string {
  return String(value ?? '').trim();
}

function toBool(value: unknown): boolean {
  return value === true;
}

function qualityGatePass(gate: QualityGateLike | null | undefined): boolean {
  if (!gate || typeof gate !== 'object') return false;
  return toText((gate as any).status) === 'pass';
}

function listReasonCodes(input: ArtifactLike | null | undefined): string[] {
  const reasons: string[] = [];
  const correction = Array.isArray(input?.correctionReasons) ? input?.correctionReasons ?? [] : [];
  for (const entry of correction) {
    const code = toText(entry?.code);
    if (code) reasons.push(code);
  }
  const gate = input?.qualityGate;
  if (gate && typeof gate === 'object' && Array.isArray((gate as any).reasons)) {
    for (const r of (gate as any).reasons as unknown[]) {
      const code = toText(r);
      if (code) reasons.push(code);
    }
  }
  return Array.from(new Set(reasons));
}

function hasRealDocumentContractFailure(reasonCodes: string[]): boolean {
  return reasonCodes.includes('real_document_contract_failed');
}

function isFailedArtifact(input: ArtifactLike | null | undefined): boolean {
  const gs = toText(input?.generationState);
  if (gs === 'generation_failed' || gs === 'failed') return true;
  const qs = toText(input?.qualityStatus);
  if (qs === 'failed') return true;
  return false;
}

function isGeneratedUnusableArtifact(input: ArtifactLike | null | undefined): boolean {
  const gs = toText(input?.generationState);
  return gs === 'generated_unusable';
}

function isPresentArtifact(input: ArtifactLike | null | undefined): boolean {
  if (!input) return false;
  const gs = toText(input.generationState);
  if (!gs) return false;
  return gs !== 'not_started' && gs !== 'generating' && gs !== 'missing';
}

export function resolveDocumentReadinessState(input: {
  resumeArtifact: ArtifactLike | null;
  coverLetterArtifact: ArtifactLike | null;
  critiqueResult?: { readiness?: unknown; status?: unknown; issues?: unknown } | null;
  qualityGate?: QualityGateLike | null;
  exportReady?: unknown;
  generationState?: unknown;
}): { state: DocumentReadinessState; reasons: string[]; impossibleStatePrevented: boolean } {
  const resume = input.resumeArtifact;
  const cover = input.coverLetterArtifact;

  const reasons: string[] = [];
  let impossibleStatePrevented = false;

  const resumePresent = isPresentArtifact(resume);
  const coverPresent = isPresentArtifact(cover);
  if (!resumePresent || !coverPresent) {
    return { state: 'missing', reasons: ['missing_artifacts'], impossibleStatePrevented: false };
  }

  const resumeReasons = listReasonCodes(resume);
  const coverReasons = listReasonCodes(cover);
  const mergedReasonCodes = Array.from(new Set([...resumeReasons, ...coverReasons]));

  const anyFailed = isFailedArtifact(resume) || isFailedArtifact(cover);
  if (anyFailed) {
    return { state: 'failed', reasons: ['generation_failed', ...mergedReasonCodes].slice(0, 10), impossibleStatePrevented: false };
  }

  const contractFailed = hasRealDocumentContractFailure(mergedReasonCodes);
  if (contractFailed) {
    return { state: 'generated_unusable', reasons: ['real_document_contract_failed', ...mergedReasonCodes].slice(0, 10), impossibleStatePrevented: false };
  }

  const anyUnusableState = isGeneratedUnusableArtifact(resume) || isGeneratedUnusableArtifact(cover);
  if (anyUnusableState) {
    return { state: 'generated_unusable', reasons: ['generated_unusable', ...mergedReasonCodes].slice(0, 10), impossibleStatePrevented: false };
  }

  const resumeExportReady = toBool(resume?.exportReady);
  const coverExportReady = toBool(cover?.exportReady);
  const bothExportReady = resumeExportReady && coverExportReady;

  const resumeGatePass = qualityGatePass(resume?.qualityGate ?? null);
  const coverGatePass = qualityGatePass(cover?.qualityGate ?? null);
  const bothQualityPass = resumeGatePass && coverGatePass;

  // READY: must be exportable and passed quality gates. Critique can never upgrade beyond this.
  if (bothExportReady && bothQualityPass) {
    const critiqueReadiness = toText(input.critiqueResult?.readiness || input.critiqueResult?.status).toLowerCase();
    if (critiqueReadiness && critiqueReadiness !== 'ready' && critiqueReadiness !== 'strong') {
      reasons.push('critique_detected_weakness');
      // Critique may downgrade even exportable artifacts.
      return { state: 'needs_refinement', reasons, impossibleStatePrevented: false };
    }
    return { state: 'ready', reasons: [], impossibleStatePrevented: false };
  }

  // At this point, artifacts exist and did not fatally fail contract. Non-exportable or non-pass gates => needs refinement.
  if (!bothExportReady) reasons.push('export_blocked');
  if (!bothQualityPass) reasons.push('quality_gate_not_pass');

  // Prevent critique from claiming "ready/strong" in this non-ready lane.
  const critiqueReadiness = toText(input.critiqueResult?.readiness || input.critiqueResult?.status).toLowerCase();
  if (critiqueReadiness === 'ready' || critiqueReadiness === 'strong') {
    impossibleStatePrevented = true;
    reasons.push('critique_overridden_by_artifact_truth');
  }

  return { state: 'needs_refinement', reasons: [...reasons, ...mergedReasonCodes].slice(0, 10), impossibleStatePrevented };
}

