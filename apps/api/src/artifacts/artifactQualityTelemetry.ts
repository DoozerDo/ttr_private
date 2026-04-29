import type { Logger } from '@nestjs/common';
import type { ArtifactQualityGate } from './artifactQualityValidator';

export type ArtifactQualityTelemetryContext = {
  artifactType: 'resume' | 'cover_letter';
  baselineId: string;
  baselineVersionId: string;
  jobId: string;
  analysisId: string | null;
  requestId: string | null;
};

type ArtifactQualityTelemetryPayload = {
  event: string;
  artifactType: ArtifactQualityTelemetryContext['artifactType'];
  firstPassQualityStatus: ArtifactQualityGate['status'];
  firstPassReasons: string[];
  repairAttempted: boolean;
  finalQualityStatus: ArtifactQualityGate['status'];
  finalReasons: string[];
  repairedSuccessfully: boolean;
  baselineId: string;
  baselineVersionId: string;
  jobId: string;
  analysisId: string | null;
  requestId: string | null;
};

function sanitizeReasons(reasons: string[] | null | undefined): string[] {
  if (!Array.isArray(reasons)) return [];
  return reasons
    .map((reason) => String(reason ?? '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function emitArtifactQualityTelemetry(
  logger: Pick<Logger, 'log'>,
  ctx: ArtifactQualityTelemetryContext,
  input: {
    firstPass: ArtifactQualityGate;
    final: ArtifactQualityGate;
    repairAttempted: boolean;
  },
) {
  const repairedSuccessfully =
    input.repairAttempted &&
    input.firstPass.status === 'needs_refinement' &&
    input.final.status === 'pass';

  const payloadBase = {
    artifactType: ctx.artifactType,
    firstPassQualityStatus: input.firstPass.status,
    firstPassReasons: sanitizeReasons(input.firstPass.reasons),
    repairAttempted: input.repairAttempted,
    finalQualityStatus: input.final.status,
    finalReasons: sanitizeReasons(input.final.reasons),
    repairedSuccessfully,
    baselineId: ctx.baselineId,
    baselineVersionId: ctx.baselineVersionId,
    jobId: ctx.jobId,
    analysisId: ctx.analysisId ?? null,
    requestId: ctx.requestId ?? null,
  } satisfies Omit<ArtifactQualityTelemetryPayload, 'event'>;

  if (input.firstPass.status === 'pass') {
    logger.log(
      `[artifact_quality] ${JSON.stringify({
        event: 'artifact_quality_pass_first_try',
        ...payloadBase,
      } satisfies ArtifactQualityTelemetryPayload)}`,
    );
    return;
  }

  if (input.repairAttempted) {
    logger.log(
      `[artifact_quality] ${JSON.stringify({
        event: 'artifact_quality_repair_attempted',
        ...payloadBase,
      } satisfies ArtifactQualityTelemetryPayload)}`,
    );
  }

  logger.log(
    `[artifact_quality] ${JSON.stringify({
      event: repairedSuccessfully
        ? 'artifact_quality_repair_succeeded'
        : 'artifact_quality_repair_failed',
      ...payloadBase,
    } satisfies ArtifactQualityTelemetryPayload)}`,
  );
}

/**
 * Developer note:
 * - High `artifact_quality_pass_first_try` rate => generator is producing clean outputs.
 * - High `artifact_quality_repair_succeeded` rate => deterministic repair is meaningfully improving quality.
 * - High `artifact_quality_repair_failed` rate => upstream generator needs improvement and/or consider adding an LLM retry.
 *
 * This telemetry intentionally excludes generated content to avoid leaking sensitive data.
 */

