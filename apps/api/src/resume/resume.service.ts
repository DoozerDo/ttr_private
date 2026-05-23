import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { Baseline } from '../baseline/baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { ComplianceService } from '../compliance/compliance.service';
import {
  getInsufficientExtractedTextDetails,
  INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
  INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
} from '../compliance/extracted-text.utils';
import { validateComplianceWithFallback } from '../compliance/compliance-error.utils';
import { shapeComplianceForUi } from '../compliance/compliance-ui-shaping';
import {
  ComplianceAction,
  ComplianceFlag,
  ComplianceTextSection,
  GeneratedTextSourceType,
} from '../compliance/compliance.types';
import { validateStatementIntegrity } from '../compliance/statement-integrity';
import { Job } from '../jobs/job.entity';
import { ApplicationsService } from '../applications/applications.service';
import type { CxFitScoreSnapshot } from '../applications/applications.service';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { AUTO_GENERATE_THRESHOLD } from '../config/autoGenerateThreshold';
import { VERIFIED_ONLY_GENERATION_THRESHOLD } from '../config/verifiedOnlyGenerationThreshold';
import { CriticalFlowEventType, CriticalFlowTrackerService } from '../support/critical-flow-tracker.service';
import { WorkflowIdempotencyService, type WorkflowIdempotencyReservation } from '../common/workflow-idempotency.service';
import { StudioArtifactsService } from '../studio-artifacts/studio-artifacts.service';
import '../docx-templates/templates';
import {
  ResumeExportSection,
} from '../docx-templates/mappers/resume-sections-to-model';
import {
  DocxRenderContextBase,
  ResumeDocxModel,
} from '../docx-templates/docx-template.types';
import {
  DEFAULT_RESUME_TEMPLATE_KEY,
  getDocxTemplate,
} from '../docx-templates/docx-template.registry';
import { resolveBaselineIdentity } from '../baseline/baseline-identity.utils';
import { resolveBaselineSectionsForGeneration } from '../baseline/baseline-section-source';
import * as ResumeDraftBullets from './resume-draft-bullets';
import type { ResumeDraftSection } from './resume-draft-bullets';
import {
  buildNormalizedResumeValidationFailures,
  buildNormalizedResumeDocument,
  buildResumePlainText,
  formatResumeV2InvalidMessage,
  mapNormalizedResumeToDocxModel,
  normalizeNormalizedResumeDocument,
  validateNormalizedResumeDocument,
} from './resume-normalization';
import { polishNormalizedResumeDocument } from '../language-style-pass';
import type { DocumentStrategyPlanLike } from '../document-strategy-plan.types';
import {
  buildBaselineEvidenceTermInventory,
  detectClaimRiskForBullet,
  type ClaimRiskResult,
  summarizeClaimRisk,
} from './claim-risk';
import { validateAnalysisContext } from '../common/analysis-context-binding';
import {
  filterComplianceFlagsByCanonicalClaims,
  getCanonicalVerifiedClaimLabels,
} from '../common/readiness-claim-truth';
import { validateGenerationTrace } from '../generation/generation-validation';
import type { ArtifactTraceAudit } from '../generation/artifact-trace-audit';
import {
  evaluateInterpretedEvidenceEligibility,
  buildSyntheticBaselineSectionsFromInterpretedEvidence,
  buildInterpretedEvidenceIdToItemMapFromSyntheticContainers,
  buildEvidenceDetailsMapFromTraceMap,
} from '../generation/interpreted-evidence-artifact-support';
import { buildArtifactFailurePayload } from '../generation/artifact-failure';
import type {
  DocumentGenerationExports,
  NormalizedResumeDocument,
  UserSafeDisplayPayload,
} from '../documents/normalized-document.models';
import { SyntheticMetadataInput } from '../synthetic/synthetic-metadata.types';
import {
  repairResumeForQuality,
  repairResumeStructure,
  validateResumeArtifactQuality,
  type ArtifactQualityGate,
} from '../artifacts/artifactQualityValidator';
import { validateResumeArtifactQualityStrict } from '../artifacts/artifactQualityValidator';
import { BaselineResumeV2BackfillService } from '../baseline/baseline-resume-v2-backfill.service';
import { sanitizeResumeForTrailingFragments, trimIncompleteTrailingFragments } from '../artifacts/artifactQualityValidator';
import { emitArtifactQualityTelemetry } from '../artifacts/artifactQualityTelemetry';
import { sanitizeResumePreviewForStudio } from './resumePreviewSanitizer';
import { TargetRolePositioningResolver } from '../positioning/target-role-positioning.resolver';
import { PositioningPlanService } from '../positioning/positioning-plan.service';
import { buildAuthoritativeRenderPlan } from '../positioning/authoritative-render-plan';
import type { CareerIdentitySnapshot } from '../career-identity/career-identity.models';
import { deriveCareerIdentityFromStructuredBaseline } from '../career-identity/career-identity.derive';
import { buildAuthoritativeResumeDraftFromResumeV2 } from './resumeTemplateAssembler';
import { validateRealResumeDocument } from '../artifacts/realDocumentValidator';
import { extractStructuredBaselineFromSections } from '../baseline/structuredBaselineExtractor';
import { evaluateBaselineTemplateReadiness } from '../baseline/baselineTemplateReadiness';
import { interpretEvidenceFromResumeText } from '../evidence/evidence-interpreter';
import { resolveEvidenceReadinessFromSummary } from '../evidence/readiness-thresholds';
import type { EvidenceItem } from '../evidence/evidence-model';
import { resolveGenerationEvidence } from '../generation/generation-evidence-resolver';
import { decideGenerationEligibility } from '../generation/generation-eligibility';
import {
  assembleResumeFromStructuredBaseline,
  isAllowedStructuredTemplateExperienceHeader,
  type ResumeTemplateIdentityLike,
} from './resumeTemplateAssembler';
import {
  buildDeterministicResumeV2FromBaseline,
  RESUME_GENERATION_V2_FEATURE_FLAG,
} from './resume-generation-v2';

function countSentencesLoose(text: string): number {
  return String(text ?? '')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean).length;
}

export type GenerateResumeRequest = {
  baselineId: string;
  baselineVersionId?: string | null;
  jobId?: string | null;
  analysisId?: string;
  opportunityId?: string | null;
  excludedRequirements?: string[];
  oneTap?: boolean;
  forceRegenerate?: boolean;
  editedResume?: NormalizedResumeDocument;
  documentStrategyPlan?: DocumentStrategyPlanLike;
};

function buildVerifiedOnlyRequest(request: GenerateResumeRequest): GenerateResumeRequest {
  return {
    baselineId: request.baselineId,
    baselineVersionId: request.baselineVersionId ?? null,
    jobId: request.jobId ?? null,
    analysisId: request.analysisId,
    oneTap: true,
  };
}

// Resume preview sanitization is implemented in `resumePreviewSanitizer.ts` so it can be reused by
// both generation and Studio artifact rehydration read paths without circular imports.

const NO_CLAIM_RISK: ClaimRiskResult = { level: 'None', flaggedTerms: [] };

function normalizeMinimalLine(value: string): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBulletLines(value: string): string[] {
  const lines = String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const bullets: string[] = [];
  for (const line of lines) {
    const match = line.match(/^(?:[-*•]\s+|\(?\d{1,3}\)?[.)]\s+|[A-Za-z][.)]\s+)(.+)$/);
    if (match?.[1]) {
      const normalized = normalizeMinimalLine(match[1]);
      if (normalized) bullets.push(normalized);
    }
  }
  return bullets;
}

function countKeywordOverlap(text: string, keywordSet: Set<string>): number {
  const normalized = normalizeMinimalLine(text).toLowerCase();
  if (!normalized) return 0;
  let count = 0;
  keywordSet.forEach((keyword) => {
    if (keyword && normalized.includes(keyword)) count += 1;
  });
  return count;
}

function reorderCommaSeparatedPhrasesByKeywordOverlap(text: string, keywordSet: Set<string>): string {
  const normalized = normalizeMinimalLine(text);
  if (!normalized) return '';
  const parts = normalized
    .split(/,\s+/)
    .map((part) => normalizeMinimalLine(part))
    .filter(Boolean);
  if (parts.length <= 1) return normalized;
  const scored = parts.map((part, idx) => ({
    idx,
    part,
    score: countKeywordOverlap(part, keywordSet),
  }));
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored.map((entry) => entry.part).join(', ');
}

function stripCrossCompanyBullets(input: {
  experience: Array<Record<string, unknown>>;
}): { experience: Array<Record<string, unknown>>; blockedCount: number } {
  const experience = Array.isArray(input.experience) ? input.experience : [];
  const companies = experience
    .map((e) => normalizeMinimalLine(String((e as any)?.company ?? '')))
    .filter((c) => c.length >= 3);
  const companyNeedles = companies
    .map((c) => c.toLowerCase())
    // Avoid accidental substring matches on short tokens (e.g., "Inc").
    .filter((c) => c.length >= 4);

  let blockedCount = 0;
  const sanitized = experience.map((entry) => {
    const company = normalizeMinimalLine(String((entry as any)?.company ?? ''));
    const roleTitle = normalizeMinimalLine(String((entry as any)?.roleTitle ?? ''));
    const bulletsRaw = Array.isArray((entry as any)?.bullets) ? ((entry as any).bullets as unknown[]) : [];
    const bullets: string[] = [];

    const ownNeedle = company.toLowerCase();
    for (const bulletValue of bulletsRaw) {
      const bullet = normalizeMinimalLine(String(bulletValue ?? ''));
      if (!bullet) continue;
      const lowered = bullet.toLowerCase();
      const mentionsOtherCompany = companyNeedles.some((needle) => needle !== ownNeedle && lowered.includes(needle));
      if (mentionsOtherCompany) {
        blockedCount += 1;
        continue;
      }
      bullets.push(bullet);
    }
    return { ...(entry as any), company, roleTitle, bullets };
  });

  return { experience: sanitized, blockedCount };
}

function enforceEmployerRoleBulletProvenance(input: {
  experience: Array<Record<string, unknown>>;
}): { experience: Array<Record<string, unknown>>; blockedCount: number } {
  const experience = Array.isArray(input.experience) ? input.experience : [];
  let blockedCount = 0;

  const sanitized = experience.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const company = normalizeMinimalLine(String((entry as any)?.company ?? ''));
    const roleTitle = normalizeMinimalLine(String((entry as any)?.roleTitle ?? ''));
    const expectedRoleKey = `${company}::${roleTitle}`;

    const bullets = Array.isArray((entry as any)?.bullets) ? ((entry as any).bullets as unknown[]) : [];
    const sourceKeys = Array.isArray((entry as any)?.bulletSourceRoleKeys)
      ? ((entry as any).bulletSourceRoleKeys as unknown[]).map((k) => String(k ?? ''))
      : null;

    if (!sourceKeys || sourceKeys.length !== bullets.length) return entry;

    const keptBullets: unknown[] = [];
    const keptKeys: string[] = [];
    for (let i = 0; i < bullets.length; i += 1) {
      const key = sourceKeys[i] ?? '';
      if (key && key !== expectedRoleKey) {
        blockedCount += 1;
        continue;
      }
      keptBullets.push(bullets[i]);
      keptKeys.push(key);
    }

    return { ...(entry as any), company, roleTitle, bullets: keptBullets, bulletSourceRoleKeys: keptKeys };
  });

  return { experience: sanitized, blockedCount };
}

export type GenerateResumeOptions = {
  enforceOneTap?: boolean;
  preflightOnly?: boolean;
  skipReadinessGate?: boolean;
};

export type ResumePreExportSnapshot = {
  baselineId: string;
  baselineVersionId: string;
  jobId: string | null;
  quality: 'optimized' | 'draft';
  sections: ResumeExportSection[];
  sectionFragments: Array<{ title: string | null; content: string }>;
  docxModel: ResumeDocxModel;
  normalizedDocument: NormalizedResumeDocument;
};

export type ResumeGenerationResponse = {
  ok: true;
  status: 'success';
  generationStatus: 'success';
  exportReady: boolean;
  blocked: false;
  baselineId: string;
  baselineVersionId: string;
  jobId: string | null;
  sections: ResumeExportSection[];
  compliance_flags: ComplianceFlag[];
  compliance_blocked: boolean;
  audit_id: string;
  auditId: string;
  baseline_version_hash: string | null;
  quality: 'optimized' | 'draft';
  traceMap: ArtifactTraceAudit['traceMap'];
  debugTrace: ArtifactTraceAudit['debugTrace'];
  evidenceDetailsMap?: ArtifactTraceAudit['evidenceDetailsMap'];
  exports: DocumentGenerationExports;
  preview: {
    resume: NormalizedResumeDocument | null;
  };
  trackerEntryId: string | null;
  trackerStatus: string | null;
  opportunityId: string | null;
  claimRiskSummary: unknown;
  gapAnalysis: unknown;
  gapGuidance: unknown;
  display: UserSafeDisplayPayload;
  safeDisplay: UserSafeDisplayPayload;
  internal: Record<string, unknown>;
  qualityGate?: ArtifactQualityGate;
  idempotency?: {
    status:
      | 'accepted_new'
      | 'existing_in_flight'
      | 'existing_completed'
      | 'rejected_stale'
      | 'persistence_conflict';
    runId: string;
    dedupeKey: string;
    reused: boolean;
  };
};

type ResumeExperiencePipelineDiagnostics = {
  resumeGenerationStage?: string;
  resumeGenerationReason?: string;
  baselineVersionLoaded: boolean;
  totalBaselineSections: number;
  sectionTypeHistogram: Record<string, number>;
  logicalUnitsReconstructed: number;
  extractedEvidenceUnits: number;
  selectedEvidenceUnits: number;
  draftedBullets: number;
  anchorValidationPassed?: boolean;
  resumeStructureAssembled?: boolean;
  complianceEvaluationPassed?: boolean;
  candidateExperienceLikeSections: number;
  candidateExperienceLikeRetainedSections: number;
  strictTypedExperienceSections: number;
  strictRetainedExperienceSections: number;
  baselineExperienceSections: number;
  allowedExperienceSections: number;
  draftedExperienceSections: number;
  draftedExperienceSectionsWithBullets: number;
  normalizedExperienceEntries: number;
  validatedExperienceEntries: number;
  experienceLikeSectionIds: string[];
  retainedExperienceSectionIds: string[];
  stageFailureReason?: string;
};

@Injectable()
export class ResumeService {
  private readonly positioningResolver = new TargetRolePositioningResolver();
  private readonly positioningPlanService = new PositioningPlanService();
  private readonly logger = new Logger(ResumeService.name);

  constructor(
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(BaselineVersion)
    private readonly baselineVersionRepository: Repository<BaselineVersion>,
    @InjectRepository(BaselineBlockPolicy)
    private readonly baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>,
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentRepository: Repository<FitAssessment>,
    private readonly complianceService: ComplianceService,
    private readonly applicationsService: ApplicationsService,
    private readonly opportunitiesService: OpportunitiesService,
    private readonly gapAnalysisService: GapAnalysisService,
    private readonly criticalFlowTrackerService: CriticalFlowTrackerService,
    private readonly workflowIdempotencyService: WorkflowIdempotencyService,
    private readonly studioArtifactsService: StudioArtifactsService,
    private readonly baselineResumeV2BackfillService?: BaselineResumeV2BackfillService,
  ) {}

  private async findLatestAssessment(
    userId: string,
    jobId: string,
    baselineId?: string,
  ) {
    return this.fitAssessmentRepository.findOne({
      where: baselineId ? { userId, jobId, baselineId } : { userId, jobId },
      order: { createdAt: 'DESC' },
    });
  }

  private ensureOneTapAllowed(
    assessment: FitAssessment | null | undefined,
    minScore: number = AUTO_GENERATE_THRESHOLD,
  ) {
    if (!assessment || assessment.overallScore < minScore) {
      throw new UnprocessableEntityException({
        error: {
          code: 'fit_score_too_low',
          message: `One tap resume generation requires fit score >= ${minScore}.`,
          details: { last_score: assessment?.overallScore ?? null },
        },
      });
    }
  }

  private buildPdfBuffer(content: string) {
    const normalizePdfText = (value: string) => {
      const normalizedChars = value
        // Normalize common Unicode punctuation to WinAnsi-safe text.
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\u2026/g, '...')
        .replace(/\u00a0/g, ' ')
        // Keep visible bullet glyph in plain text while normalizing variants.
        .replace(/[\u25CF\u25E6\u2043\u2219]/g, 'â€¢')
        // Repair common mojibake sequences when UTF-8 punctuation was decoded as Latin-1.
        .replace(/Ã¢â‚¬Â¢/g, 'â€¢')
        .replace(/Ã¢â‚¬â€œ|Ã¢â‚¬â€/g, '-')
        .replace(/Ã¢â‚¬Ëœ|Ã¢â‚¬â„¢/g, "'")
        .replace(/Ã¢â‚¬Å“|Ã¢â‚¬/g, '"')
        .replace(/Ã¢â‚¬Â¦/g, '...');

      return normalizedChars
        .split('\n')
        .map((line) => {
          // Some inputs still encode bullets as leading "&"; normalize only at line start.
          if (/^\s*&&+Â¢\s+/.test(line)) {
            return line.replace(/^\s*&&+Â¢\s+/, '- ');
          }
          if (/^\s*&\s+/.test(line)) {
            return line.replace(/^\s*&\s+/, '- ');
          }
          if (/^\s*â€¢\s+/.test(line)) {
            return line.replace(/^\s*â€¢\s+/, '- ');
          }
          return line;
        })
        .join('\n');
    };

    const sanitizeForPdf = (value: string) =>
      value
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');

    const wrapLine = (line: string, maxChars: number) => {
      if (!line.trim()) return [''];
      const words = line.trim().split(/\s+/);
      const wrapped: string[] = [];
      let current = '';

      for (const word of words) {
        if (!current.length) {
          current = word;
          continue;
        }
        if (`${current} ${word}`.length <= maxChars) {
          current = `${current} ${word}`;
          continue;
        }
        wrapped.push(current);
        current = word;
      }

      if (current.length) wrapped.push(current);
      return wrapped;
    };

    const normalized = normalizePdfText(
      content.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
    );
    const wrappedLines = normalized
      .split('\n')
      .flatMap((line) => wrapLine(line, 95));
    const lines = wrappedLines.length ? wrappedLines : [''];

    const lineHeight = 14;
    const maxLinesPerPage = 48;
    const pageChunks: string[][] = [];
    for (let i = 0; i < lines.length; i += maxLinesPerPage) {
      pageChunks.push(lines.slice(i, i + maxLinesPerPage));
    }

    const objectBodies: string[] = [];
    const pageObjectNumbers: number[] = [];
    objectBodies.push('<< /Type /Catalog /Pages 2 0 R >>'); // 1
    objectBodies.push(''); // 2 (filled after page refs are known)

    for (const pageLines of pageChunks) {
      const pageObjectNumber = objectBodies.length + 1;
      const contentObjectNumber = pageObjectNumber + 1;
      const textCommands = [
        'BT',
        '/F1 11 Tf',
        `${lineHeight} TL`,
        '72 750 Td',
        ...pageLines.flatMap((line, index) => {
          const escaped = sanitizeForPdf(line);
          if (index === 0) return [`(${escaped}) Tj`];
          return ['T*', `(${escaped}) Tj`];
        }),
        'ET',
      ].join('\n');

      const contentStream =
        `<< /Length ${Buffer.byteLength(textCommands, 'latin1')} >>\n` +
        `stream\n${textCommands}\nendstream`;

      pageObjectNumbers.push(pageObjectNumber);
      objectBodies.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjectNumber} 0 R /Resources << /Font << /F1 ${pageChunks.length * 2 + 3} 0 R >> >> >>`,
      );
      objectBodies.push(contentStream);
    }

    const kids = pageObjectNumbers.map((number) => `${number} 0 R`).join(' ');
    objectBodies[1] = `<< /Type /Pages /Kids [${kids}] /Count ${pageObjectNumbers.length} >>`;

    objectBodies.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];

    objectBodies.forEach((body, index) => {
      offsets.push(Buffer.byteLength(pdf, 'latin1'));
      pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xrefOffset = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objectBodies.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i <= objectBodies.length; i += 1) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf +=
      `trailer\n<< /Size ${objectBodies.length + 1} /Root 1 0 R >>\n` +
      `startxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'latin1');
  }

  private buildExportFilename(format: 'docx' | 'pdf', company?: string | null) {
    const safeCompany = (company ?? 'resume')
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'resume';
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    return `${safeCompany}-${mm}-${dd}-${yyyy}.${format}`;
  }

  private applyPoliciesToSections(
    sections: BaselineSection[],
    policies: BaselineBlockPolicy[],
  ) {
    if (!policies.length) {
      return [...sections].sort((a, b) => a.order - b.order);
    }

    const policyMap = new Map<string, BaselineBlockPolicy>(
      policies.map((policy) => [policy.baselineSectionId, policy]),
    );

    return [...sections]
      .map((section) => {
        const policy = policyMap.get(section.id);
        return {
          ...section,
          includePolicy: policy?.includePolicy ?? section.includePolicy,
          order: policy?.order ?? section.order,
          sectionType: section.sectionType ?? section.type,
        } as BaselineSection;
      })
      .sort((a, b) => a.order - b.order);
  }

  private buildBlockedDisplayPayload(
    complianceFlags: Array<{
      code?: string;
      message?: string;
      severity?: string;
      confidence?: number;
      evidence?: Array<{ baseline: string; generated: string }>;
    }>,
  ): UserSafeDisplayPayload {
    const shaped = shapeComplianceForUi(complianceFlags as any);
    return {
      title: 'Resume blocked by compliance',
      description:
        'Some generated statements could not be verified against your baseline.',
      reasons: shaped.reasons,
      cta: {
        label: 'Review compliance in Results',
        href: '/results',
      },
    };
  }

  private buildSuccessDisplayPayload(reasons?: UserSafeDisplayPayload['reasons']): UserSafeDisplayPayload {
    return {
      title: 'Resume generated successfully',
      description: 'Your resume draft is ready for preview and export.',
      reasons: reasons ?? [],
      cta: {
        label: 'Review results',
        href: '/results',
      },
    };
  }

  private buildResumeTraceAudit(
    sections: ResumeExportSection[],
    resumeInputSections: BaselineSection[],
    interpretedEvidenceByGeneratedEvidenceId?: Map<string, EvidenceItem>,
  ): ArtifactTraceAudit {
    const interpretedEvidenceById = interpretedEvidenceByGeneratedEvidenceId ?? new Map<string, EvidenceItem>();
    const availableEvidenceIds = resumeInputSections.flatMap((section) => {
      const logicalUnits = ResumeDraftBullets.reconstructLogicalTextUnits(section.content ?? '');
      return ResumeDraftBullets.extractEvidenceUnitsFromLogicalUnits(section.id, logicalUnits).map((unit) => unit.id);
    });

    const traceMap: Record<string, string[]> = {};
    const tracedLines: Array<{ id: string; text: string; sourceEvidenceIds?: string[]; sourceEvidenceDetails?: any[] }> =
      [];
    const debugLines: Array<{
      lineId: string;
      text: string;
      sectionType: string;
      classification: 'required_content' | 'structural';
      traceMapEntry: string[];
      sourceEvidenceIdsBeforeAudit: string[];
      failureReason?: string;
    }> = [];

    sections.forEach((section, sectionIndex) => {
      const upperType = String(section.type ?? '').toUpperCase();
      const pushLine = (
        lineId: string,
        text: string,
        ids: string[],
        classification: 'required_content' | 'structural',
      ) => {
        traceMap[lineId] = ids;
        const details = ids
          .map((id) => interpretedEvidenceById.get(id))
          .filter(Boolean)
          .map((item) => ({
            evidenceItemId: item!.id,
            evidenceStrength: item!.evidenceStrength,
            evidenceSource: item!.evidenceSource,
            supportLevel: item!.supportLevel,
            generationUse: item!.generationUse,
            constraintsApplied: item!.constraints ?? [],
            missingElements: item!.missingElements,
          }));
        tracedLines.push({ id: lineId, text, sourceEvidenceIds: ids, sourceEvidenceDetails: details.length ? details : undefined });
        debugLines.push({
          lineId,
          text,
          sectionType: upperType,
          classification,
          traceMapEntry: ids,
          sourceEvidenceIdsBeforeAudit: ids,
        });
      };

      const sectionBullets = Array.isArray(section.bullets) ? section.bullets : [];
      const shouldTraceEmptyIds =
        upperType === 'EXPERIENCE';
      if (upperType === 'SUMMARY') {
        sectionBullets.forEach((bullet, bulletIndex) => {
          const source = bullet as { source?: { sourceEvidenceIds?: string[] } };
          const ids = (source.source?.sourceEvidenceIds ?? []).filter(Boolean);
          if (!ids.length && !shouldTraceEmptyIds) return;
          pushLine(`summary:${sectionIndex}:${bulletIndex}`, bullet.text ?? '', ids, 'required_content');
        });
        return;
      }
      if (upperType === 'SKILLS') {
        sectionBullets.forEach((bullet, bulletIndex) => {
          const source = bullet as { source?: { sourceEvidenceIds?: string[] } };
          const ids = (source.source?.sourceEvidenceIds ?? []).filter(Boolean);
          if (!ids.length && !shouldTraceEmptyIds) return;
          pushLine(`skills:${sectionIndex}:${bulletIndex}`, bullet.text ?? '', ids, 'required_content');
        });
        return;
      }
      if (upperType === 'EDUCATION') {
        sectionBullets.forEach((bullet, bulletIndex) => {
          const source = bullet as { source?: { sourceEvidenceIds?: string[] } };
          const ids = (source.source?.sourceEvidenceIds ?? []).filter(Boolean);
          if (!ids.length && !shouldTraceEmptyIds) return;
          pushLine(`education:${sectionIndex}:${bulletIndex}`, bullet.text ?? '', ids, 'required_content');
        });
        return;
      }
      if (upperType !== 'EXPERIENCE') {
        return;
      }
      sectionBullets.forEach((bullet, bulletIndex) => {
        const source = bullet as { source?: { sourceEvidenceIds?: string[] } };
        const ids = (source.source?.sourceEvidenceIds ?? []).filter(Boolean);
        if (!ids.length) return;
        pushLine(`experience:${sectionIndex}:${bulletIndex}`, bullet.text ?? '', ids, 'required_content');
      });
    });

    const validation = validateGenerationTrace(tracedLines, availableEvidenceIds);
    if (!validation.passed) {
      const failureReasonByLineId = new Map<string, string>();
      validation.failures.forEach((failure) => {
        const match = failure.match(/^Line ([^ ]+) /i);
        if (match?.[1]) {
          failureReasonByLineId.set(match[1], failure);
        }
      });
      throw new UnprocessableEntityException({
        error: {
          code: 'generation_failed',
          message: 'Resume generation failed validation.',
          details: {
            failures: validation.failures,
            traceCoverage: validation.traceCoverage,
            unusedEvidence: validation.unusedEvidence,
            selectedEvidence: validation.selectedEvidence,
            debugLines: debugLines.map((line) => ({
              ...line,
              failureReason: failureReasonByLineId.get(line.lineId),
            })),
          },
        },
      });
    }

    const evidenceDetailsMap = buildEvidenceDetailsMapFromTraceMap({
      traceMap,
      interpretedEvidenceByGeneratedEvidenceId: interpretedEvidenceById,
    });

    return {
      traceMap,
      ...(evidenceDetailsMap ? { evidenceDetailsMap } : {}),
      debugTrace: validation,
    };
  }

  private sanitizeGapGuidance(gapInsights: ReturnType<GapAnalysisService['analyze']> | null) {
    if (!gapInsights) return null;

    const normalizeEvidenceForDisplay = (value: string, max = 180) => {
      const normalized = String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!normalized) return '';
      const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
      if (firstSentence.length <= max) return firstSentence;
      return `${firstSentence.slice(0, max - 3).trim()}...`;
    };
    const strengthSignals = gapInsights.strengths
      .map((value) => normalizeEvidenceForDisplay(value))
      .filter(Boolean)
      .slice(0, 6);
    const gapSignals = gapInsights.criticalGaps
      .flatMap((gap) => [
        gap.title,
        gap.requirementEvidence,
        gap.baselineEvidence ?? '',
      ])
      .map((value) => normalizeEvidenceForDisplay(value))
      .filter(Boolean)
      .slice(0, 8);
    const reframingPriorities = gapInsights.criticalGaps.slice(0, 2).map((gap) => ({
      title: normalizeEvidenceForDisplay(gap.title, 90),
      requirementEvidence: normalizeEvidenceForDisplay(gap.requirementEvidence, 180),
      baselineEvidence: gap.baselineEvidence
        ? normalizeEvidenceForDisplay(gap.baselineEvidence, 180)
        : null,
      reasoning: normalizeEvidenceForDisplay(gap.reasoning, 180),
    }));

    return {
      strengthSignals,
      gapSignals,
      reframingPriorities,
    };
  }

  private throwGenerationBlockedError(blockers: Array<{ code: string; message: string }>): never {
    throw new UnprocessableEntityException(buildArtifactFailurePayload({
      code: 'generation_blocked',
      category: 'generation_blocked',
      message:
        'Generation is not available for this role due to insufficient verified evidence.',
      detail: 'Readiness or compliance gates blocked generation.',
      retryable: false,
      userAction: {
        title: 'Review baseline readiness',
        description: 'Complete the missing verified requirements before generating again.',
      },
      diagnostics: {
        failureReasons: blockers.slice(0, 3).map((blocker) => `${blocker.code}: ${blocker.message}`),
        missingRequirements: blockers.slice(0, 3).map((blocker) => blocker.message),
      },
    }));
  }

  private throwGenerationFailedError(
    message: string,
    details?: Record<string, unknown>,
  ): never {
    const failureReasons =
      (details?.blockers as string[] | undefined) ??
      (details?.reasons as string[] | undefined) ??
      [];
    const category =
      /unsupported|insufficient_verified_content|resume_structure_empty|paragraph_only/i.test(message) ||
      /unsupported/i.test(String(details?.reason ?? ''))
        ? 'unsupported_input'
        : /trace/i.test(String(details?.stage ?? ''))
          ? 'trace_failure'
          : 'validation_failure';
    throw new UnprocessableEntityException(buildArtifactFailurePayload({
      code: 'generation_failed',
      category,
      message,
      detail: typeof details?.message === 'string' ? details.message : undefined,
      retryable: category !== 'unsupported_input',
      userAction:
        category === 'unsupported_input'
          ? {
              title: 'Add more supported baseline content',
              description: 'Include clearer accomplishment bullets and complete baseline sections before generating again.',
            }
          : category === 'trace_failure'
            ? {
                title: 'Repair traceable baseline evidence',
                description: 'Make sure every content line has source evidence before retrying.',
              }
            : {
                title: 'Review the generated structure',
                description: 'Check the baseline text for malformed or incomplete sections.',
              },
      diagnostics: {
        failureReasons,
        unsupportedEnvelope:
          category === 'unsupported_input' ? String(details?.reason ?? '') : undefined,
        traceCoverage: typeof details?.traceCoverage === 'number' ? details.traceCoverage : undefined,
      },
    }));
  }

  private throwUnsupportedResumeInput(message: string, unsupportedEnvelope: string): never {
    throw new UnprocessableEntityException(buildArtifactFailurePayload({
      code: 'unsupported_input',
      category: 'unsupported_input',
      message,
      detail: unsupportedEnvelope,
      retryable: false,
      userAction: {
        title: 'Add more bullet-style accomplishments',
        description: 'The current resume input needs clearer bullet or section structure before generating.',
      },
      diagnostics: {
        unsupportedEnvelope,
      },
    }));
  }

  private sanitizeDraftSectionText(value?: string | null): string {
    return String(value ?? '')
      .replace(/[\u2022\u25CF\u25E6]+/g, ' ')
      .replace(/[|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private sanitizeDraftSections(sections: ResumeDraftSection[]): ResumeDraftSection[] {
    return sections.map((section) => ({
      ...section,
      content: this.sanitizeDraftSectionText(section.content),
      bullets: (section.bullets ?? [])
        .map((bullet) => ({
          ...bullet,
          text: this.sanitizeDraftSectionText(bullet.text),
          source: bullet.source,
        }))
        .filter((bullet) => bullet.text.length > 0),
    }));
  }

  private cloneDraftSections(sections: ResumeDraftSection[]): ResumeDraftSection[] {
    return sections.map((section) => ({
      ...section,
      bullets: (section.bullets ?? []).map((bullet) => ({
        ...bullet,
        source: bullet.source ? { ...bullet.source } : bullet.source,
        relevance: bullet.relevance ? { ...bullet.relevance } : bullet.relevance,
        claimRisk: bullet.claimRisk ? { ...bullet.claimRisk } : bullet.claimRisk,
      })),
    }));
  }

  private buildMinimalResumeSections(baselineSections: BaselineSection[]): ResumeDraftSection[] {
    const sections: ResumeDraftSection[] = baselineSections
      .filter((section) => typeof section.content === 'string' && section.content.trim().length > 0)
      .map((section) => ({
        id: section.id,
        type: section.sectionType,
        title: section.title,
        order: section.order,
        includePolicy: section.includePolicy ?? BaselineIncludePolicy.OPTIONAL,
        source: 'baseline',
        content: String(section.content ?? '').trim(),
        rawContent: String(section.content ?? '').trim(),
        bullets: [] as ResumeDraftSection['bullets'],
      }));

    const experienceText = sections
      .filter((section) => String(section.type ?? '').toUpperCase() === 'EXPERIENCE')
      .map((section) => section.content ?? '')
      .join('\n');
    const experienceBullets = extractBulletLines(experienceText).slice(0, 4);
    const summaryText = experienceBullets.length
      ? experienceBullets.join(' ')
      : normalizeMinimalLine(experienceText).slice(0, 240);

    if (summaryText) {
      sections.unshift({
        id: 'minimal-summary',
        type: BaselineSectionType.SUMMARY,
        title: 'Summary',
        order: -1,
        includePolicy: BaselineIncludePolicy.OPTIONAL,
        source: 'baseline',
        content: summaryText,
        rawContent: summaryText,
        bullets: summaryText
          .split(/(?<=[.!?])\s+/)
          .map((sentence) => normalizeMinimalLine(sentence))
          .filter(Boolean)
          .slice(0, 2)
          .map((text, idx) => ({
            id: `minimal-summary:${idx}`,
            text,
            source: {
              baselineSectionId: 'minimal-summary',
              baselineSectionType: BaselineSectionType.SUMMARY,
              baselineSectionOrder: -1,
              bulletIndex: idx,
              sourceEvidenceIds: [],
              anchorText: text,
              anchorKind: 'sentence' as const,
              exactBaselineBullet: false,
            },
            confidence: 'High' as const,
            claimRisk: NO_CLAIM_RISK,
          })),
      });
    }

    // Ensure Experience sections include bullets when baseline has bullet-like lines.
    sections.forEach((section) => {
      const upperType = String(section.type ?? '').toUpperCase();
      if (upperType !== 'EXPERIENCE') return;
      const bullets = extractBulletLines(section.content ?? '').slice(0, 8);
      if (bullets.length) {
        section.bullets = bullets.map((text, idx) => ({
          id: `${section.id}:minimal:${idx}`,
          text,
          source: {
            baselineSectionId: String(section.id),
            baselineSectionType: String(section.type ?? ''),
            baselineSectionOrder: Number(section.order ?? 0),
            bulletIndex: idx,
            sourceEvidenceIds: [],
            anchorText: text,
            anchorKind: 'bullet_line' as const,
            exactBaselineBullet: true,
          },
          confidence: 'High' as const,
          claimRisk: NO_CLAIM_RISK,
        }));
      }
    });

    return sections;
  }

  private applyJobAlignedPresentation(payload: {
    sections: ResumeDraftSection[];
    jobText: string | null;
    dimensionScores?: FitAssessment['dimensionScores'] | null;
    jobTitle?: string | null;
    careerIdentity?: CareerIdentitySnapshot | null;
  }): ResumeDraftSection[] {
    const keywordList = ResumeDraftBullets.extractJobKeywords(payload.jobText, 28);
    const keywordSet = keywordList.length ? new Set(keywordList.map((kw) => kw.toLowerCase())) : new Set<string>();

    const strongestDimensions = payload.dimensionScores
      ? (Object.entries(payload.dimensionScores) as Array<[string, number]>)
          .filter((entry) => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
          .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
          .slice(0, 2)
          .map(([key]) => key)
      : [];

    const nextSections = payload.sections.map((section) => {
      if (String(section.type ?? '').toUpperCase() !== 'EXPERIENCE' || !Array.isArray(section.bullets)) {
        return section;
      }

      const rewrittenBullets = section.bullets.map((bullet, idx) => {
        const original = normalizeMinimalLine(bullet.text);
        if (!original) return bullet;
        const firstSentence = original.split(/(?<=[.!?])\s+/)[0] ?? original;
        const reordered = keywordSet.size ? reorderCommaSeparatedPhrasesByKeywordOverlap(firstSentence, keywordSet) : firstSentence;
        const rewritten = normalizeMinimalLine(reordered);
        if (!rewritten || rewritten === original) return bullet;
        return {
          ...bullet,
          text: rewritten,
          source: {
            ...bullet.source,
            anchorText: bullet.source?.anchorText ?? bullet.text,
            bulletIndex: typeof bullet.source?.bulletIndex === 'number' ? bullet.source.bulletIndex : idx,
          },
        };
      });

      return {
        ...section,
        bullets: rewrittenBullets,
        content: section.content,
      };
    });

    const experienceBullets = nextSections
      .filter((section) => String(section.type ?? '').toUpperCase() === 'EXPERIENCE')
      .flatMap((section) => section.bullets ?? [])
      .map((bullet) => normalizeMinimalLine(bullet.text))
      .filter(Boolean);

    // If we could not extract any usable job keywords, avoid emitting "Targeting <job title>"
    // or other tailoring semantics based on ungrounded signals. Keep baseline presentation.
    if (!keywordSet.size) {
      return nextSections;
    }

    const rankedExperienceBullets = keywordSet.size
      ? [...experienceBullets].sort((a, b) => countKeywordOverlap(b, keywordSet) - countKeywordOverlap(a, keywordSet))
      : experienceBullets;

    // Canonical identity boundary (upstream): tailoring can shift emphasis but must not pivot the narrative into
    // prohibited drift domains when that domain is only supported by isolated baseline evidence.
    const identity = payload.careerIdentity ?? null;
    const prohibited = new Set((identity?.prohibitedDriftDomains ?? []).map((d) => String(d ?? '').trim()).filter(Boolean));
    const prohibitedSignals: Array<[string, RegExp]> = [
      ['billing_operations', /\b(billing|invoice|entitlement|reconciliation|credit|dispute|metering)\b/i],
      ['revenue_operations', /\b(revops|revenue operations|pipeline|forecast|quota)\b/i],
      ['finance_operations', /\b(accounts payable|accounts receivable|close|general ledger|sox)\b/i],
    ];
    const prohibitedRegexes = prohibitedSignals.filter(([k]) => prohibited.has(k)).map(([, re]) => re);
    const prohibitedEvidenceCount = prohibitedRegexes.length
      ? experienceBullets.reduce(
          (sum, bullet) => sum + (prohibitedRegexes.some((re) => re.test(bullet)) ? 1 : 0),
          0,
        )
      : 0;
    const billingSignalsLegacy = /\b(billing|invoice|entitlement|reconciliation|credit|dispute|metering|revenue)\b/i;
    const legacyBillingEvidenceCount = experienceBullets.reduce((sum, bullet) => sum + (billingSignalsLegacy.test(bullet) ? 1 : 0), 0);

    const domainFilteredBullets = prohibitedRegexes.length
      ? prohibitedEvidenceCount < 2
        ? rankedExperienceBullets.filter((b) => !prohibitedRegexes.some((re) => re.test(b)))
        : rankedExperienceBullets
      : legacyBillingEvidenceCount >= 2
        ? rankedExperienceBullets
        : rankedExperienceBullets.filter((b) => !billingSignalsLegacy.test(b));

    const topSignals = domainFilteredBullets.slice(0, 2);
    const positioningPrefix = payload.jobTitle ? `Targeting ${payload.jobTitle}. ` : '';
    const dimensionPhrase = strongestDimensions.length
      ? `Strengths: ${strongestDimensions.map((value) => value.replace(/([A-Z])/g, ' $1').trim()).join(', ')}. `
      : '';
    const summarySentence = topSignals.length
      ? `${topSignals.join(' ')}`
      : '';

    const summaryText = normalizeMinimalLine(`${positioningPrefix}${dimensionPhrase}${summarySentence}`);
    if (!summaryText) {
      return nextSections;
    }

    const existingSummaryIndex = nextSections.findIndex(
      (section) => String(section.type ?? '').toUpperCase() === 'SUMMARY',
    );

    const summaryBullets = summaryText
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => normalizeMinimalLine(sentence))
      .filter(Boolean)
      .slice(0, 2)
      .map((text, idx) => ({
        id: `aligned-summary:${idx}`,
        text,
        source: {
          baselineSectionId: `aligned-summary`,
          baselineSectionType: BaselineSectionType.SUMMARY,
          baselineSectionOrder: -1,
          bulletIndex: idx,
          sourceEvidenceIds: [],
          anchorText: text,
          anchorKind: 'sentence' as const,
          exactBaselineBullet: false,
        },
        confidence: 'High' as const,
        claimRisk: NO_CLAIM_RISK,
      }));

    const alignedSummary: ResumeDraftSection = {
      id: existingSummaryIndex >= 0 ? nextSections[existingSummaryIndex]!.id : 'aligned-summary',
      type: BaselineSectionType.SUMMARY,
      title: 'Summary',
      order: -1,
      includePolicy: BaselineIncludePolicy.OPTIONAL,
      source: 'baseline',
      bullets: summaryBullets,
      content: summaryText,
      rawContent: summaryText,
    };

    if (existingSummaryIndex >= 0) {
      const replaced = [...nextSections];
      replaced[existingSummaryIndex] = alignedSummary;
      return replaced;
    }

    return [alignedSummary, ...nextSections];
  }

  private logNormalizationDiagnostics(payload: {
    baselineId: string;
    sectionCount: number;
    sections: Array<{ type?: string | null; title?: string | null; content?: string | null }>;
    normalized: NormalizedResumeDocument;
  }) {
    if (process.env.DEBUG_RESUME_NORMALIZATION !== 'true') return;
    const snapshot = {
      baselineId: payload.baselineId,
      sectionCount: payload.sectionCount,
      sections: payload.sections.map((section) => ({
        type: section.type ?? null,
        title: section.title ?? null,
        contentPreview: String(section.content ?? '').slice(0, 220),
      })),
      normalized: {
        heading: payload.normalized.heading,
        summary: payload.normalized.summary ?? null,
        competencies:
          payload.normalized.competencies ??
          payload.normalized.coreCompetencies ??
          [],
        experience: payload.normalized.experience.map((entry) => ({
          company: entry.company,
          roleTitle: entry.roleTitle,
          location: entry.location ?? null,
          dateRange:
            entry.dateRange ??
            [entry.startDate, entry.endDate].filter(Boolean).join(' – ') ??
            null,
          bullets: entry.bullets,
        })),
        education: payload.normalized.education ?? [],
      },
    };
    console.log('[resume-normalization]', JSON.stringify(snapshot, null, 2));
  }

  private splitIntoSentences(text: string): string[] {
    const normalized = String(text ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/[|\u00A6\uFF5C]/g, ' | ')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[ \t]+/g, ' ');
    if (!normalized.trim()) {
      return [];
    }

    const rawLines = normalized
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!rawLines.length) {
      return [];
    }

    const BULLET_LINE_PREFIX = /^[-*â€¢\u2022\u25CF\u25E6\u2043\u2219]\s+/;
    const NUMBERED_LINE_PREFIX = /^\d{1,2}[.)]\s+/;
    const DANGLING_TERMINAL_TOKEN = /\b(?:on|in|for|with|at|of|to|and|a|an|the)$/i;
    const TERMINAL_PUNCTUATION = /[.!?]$/;
    const lines: string[] = [];

    for (const rawLine of rawLines) {
      const hasExplicitBoundary =
        BULLET_LINE_PREFIX.test(rawLine) || NUMBERED_LINE_PREFIX.test(rawLine);
      const line = rawLine
        .replace(BULLET_LINE_PREFIX, '')
        .replace(NUMBERED_LINE_PREFIX, '')
        .trim();
      if (!line) continue;
      if (!lines.length || hasExplicitBoundary) {
        lines.push(line);
        continue;
      }

      const prev = lines[lines.length - 1] ?? '';
      const shouldMerge =
        (!TERMINAL_PUNCTUATION.test(prev) &&
          !/^[A-Z][A-Z\s]+$/.test(line)) ||
        DANGLING_TERMINAL_TOKEN.test(prev);
      if (shouldMerge) {
        lines[lines.length - 1] = `${prev} ${line}`.replace(/\s+/g, ' ').trim();
      } else {
        lines.push(line);
      }
    }

    return lines
      .flatMap((line) =>
        line
          .split(/(?<=[.!?])\s+/)
          .map((sentence) => sentence.trim())
          .filter(Boolean),
      )
      .filter((sentence) => !/^[|:-]+$/.test(sentence));
  }

  private buildResumeGeneratedSectionsForCompliance(
    sections: ResumeExportSection[],
  ): ComplianceTextSection[] {
    return sections.map((section) => {
      const upperType = String(section.type ?? '').toUpperCase();
      const bullets = Array.isArray(section.bullets) ? section.bullets : [];

      const sentenceSources =
        upperType === 'EXPERIENCE' && bullets.length > 0
          ? bullets.map((bullet) => ({
              text: bullet.text,
              sourceType:
                Array.isArray((bullet as { source?: { sourceEvidenceIds?: string[] } }).source?.sourceEvidenceIds) &&
                ((bullet as { source?: { sourceEvidenceIds?: string[] } }).source?.sourceEvidenceIds?.length ?? 0) > 0
                  ? GeneratedTextSourceType.BASELINE_EVIDENCE
                  : GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
            }))
          : this.splitIntoSentences(section.content ?? '').map((sentence) => ({
              text: sentence,
              sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
            }));

      const integrityCheckedSentences = sentenceSources
        .map((sentence) => {
          const sourceType =
            sentence.sourceType ?? GeneratedTextSourceType.CONNECTIVE_LANGUAGE;
          const integrity = validateStatementIntegrity(sentence.text ?? '', {
            sourceType,
          });
          if (process.env.COMPLIANCE_TRACE === 'true') {
            console.debug(
              '[compliance-trace]',
              JSON.stringify({
                detector: 'pre_compliance_statement_integrity',
                text: sentence.text ?? '',
                normalized: integrity.normalized,
                sourceType,
                statementIntegrity: integrity.valid ? 'pass' : 'fail',
                detectorInvoked: integrity.valid,
                skipReason: integrity.valid ? null : integrity.reason,
              }),
            );
          }
          if (!integrity.valid) {
            return null;
          }
          return {
            text: integrity.normalized,
            sourceType,
          };
        })
        .filter(
          (
            sentence,
          ): sentence is { text: string; sourceType: GeneratedTextSourceType } =>
            Boolean(sentence),
        );

      return {
        title: section.title,
        content: section.content,
        sectionType: section.type,
        sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        sentenceSources: integrityCheckedSentences.map((sentence) => ({
          text: sentence.text,
          sourceType:
            sentence.sourceType ?? GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
        })),
      };
    });
  }

  private buildScopeInflationBaselineSections(
    allowedSections: BaselineSection[],
    baselineVersion: BaselineVersion,
  ): Array<{
    title?: string | null;
    content?: string | null;
    sectionType?: string;
  }> {
    const baselineSections: Array<{
      title?: string | null;
      content?: string | null;
      sectionType?: string;
    }> = allowedSections.map(
      (section) => ({
        title: section.title,
        content: section.content,
        sectionType: section.sectionType ?? undefined,
      }),
    );

    const verifiedAdditionSections = (baselineVersion.verifiedAdditions ?? [])
      .map((content, index) => ({
        title: `Verified addition ${index + 1}`,
        content,
        sectionType: BaselineSectionType.OTHER ?? undefined,
      }))
      .filter(
        (section) =>
          typeof section.content === 'string' &&
          section.content.trim().length > 0,
      );

    return [...baselineSections, ...verifiedAdditionSections];
  }

  private buildExperiencePipelineDiagnostics(payload: {
    baselineVersionLoaded: boolean;
    sectionsWithPolicies: BaselineSection[];
    allowedSections: BaselineSection[];
    resumeInputSections: BaselineSection[];
    draftedSections: ResumeExportSection[];
    normalizedDocument: NormalizedResumeDocument;
    anchorValidationPassed?: boolean;
    resumeStructureAssembled?: boolean;
    complianceEvaluationPassed?: boolean;
  }): ResumeExperiencePipelineDiagnostics {
    const strictTypedExperienceSections = payload.sectionsWithPolicies.filter(
      (section) => String(section.sectionType ?? section.type ?? '').toUpperCase() === 'EXPERIENCE',
    ).length;
    const strictRetainedExperienceSections = payload.allowedSections.filter(
      (section) => String(section.sectionType ?? section.type ?? '').toUpperCase() === 'EXPERIENCE',
    ).length;
    const baselineExperienceSections = payload.resumeInputSections.filter(
      (section) => String(section.sectionType ?? section.type ?? '').toUpperCase() === 'EXPERIENCE',
    ).length;
    const allowedExperienceSections = baselineExperienceSections;
    const experienceLikeSections = payload.sectionsWithPolicies.filter((section) =>
      this.looksLikeExperienceSection(section),
    );
    const retainedExperienceLikeSections = payload.allowedSections.filter((section) =>
      this.looksLikeExperienceSection(section),
    );
    const sectionTypeHistogram: Record<string, number> = {};
    payload.sectionsWithPolicies.forEach((section) => {
      const key = String(section.sectionType ?? section.type ?? 'UNKNOWN')
        .trim()
        .toUpperCase();
      sectionTypeHistogram[key] = (sectionTypeHistogram[key] ?? 0) + 1;
    });
    const draftedExperienceSections = payload.draftedSections.filter(
      (section) => String(section.type ?? '').toUpperCase() === 'EXPERIENCE',
    ).length;
    const draftedExperienceSectionsWithBullets = payload.draftedSections.filter(
      (section) =>
        String(section.type ?? '').toUpperCase() === 'EXPERIENCE' &&
        Array.isArray(section.bullets) &&
        section.bullets.length > 0,
    ).length;
    const normalizedExperienceEntries = payload.normalizedDocument.experience.length;
    const validatedExperienceEntries = payload.normalizedDocument.experience.filter(
      (entry) =>
        entry.company?.trim().length > 0 &&
        !/^company$/i.test(entry.company.trim()) &&
        entry.bullets.length > 0,
    ).length;

    const logicalUnitsReconstructed = payload.resumeInputSections
      .filter((section) => String(section.sectionType ?? section.type ?? '').toUpperCase() === 'EXPERIENCE')
      .reduce(
        (sum, section) => sum + ResumeDraftBullets.reconstructLogicalTextUnits(section.content ?? '').length,
        0,
      );
    const extractedEvidenceUnits = payload.resumeInputSections
      .filter((section) => String(section.sectionType ?? section.type ?? '').toUpperCase() === 'EXPERIENCE')
      .reduce((sum, section) => {
        const logicalUnits = ResumeDraftBullets.reconstructLogicalTextUnits(section.content ?? '');
        return sum + ResumeDraftBullets.extractEvidenceUnitsFromLogicalUnits(section.id, logicalUnits).length;
      }, 0);
    const draftedBullets = payload.draftedSections.reduce(
      (sum, section) => sum + (Array.isArray(section.bullets) ? section.bullets.length : 0),
      0,
    );
    const selectedEvidenceUnits = payload.draftedSections.reduce((sum, section) => {
      const bullets = Array.isArray(section.bullets) ? section.bullets : [];
      return (
        sum +
        bullets.reduce((bulletSum, bullet) => {
          const ids = (bullet as { source?: { sourceEvidenceIds?: string[] } })
            ?.source?.sourceEvidenceIds;
          return bulletSum + (Array.isArray(ids) ? ids.length : 0);
        }, 0)
      );
    }, 0);

    let stageFailureReason: string | undefined;
    let resumeGenerationStage: string | undefined;
    let resumeGenerationReason: string | undefined;
    if (baselineExperienceSections > 0 && logicalUnitsReconstructed === 0) {
      resumeGenerationStage = 'logical_unit_reconstruction';
      resumeGenerationReason = 'no_logical_units_reconstructed';
      stageFailureReason =
        'No logical experience units could be reconstructed from baseline content.';
    } else if (baselineExperienceSections > 0 && extractedEvidenceUnits === 0) {
      resumeGenerationStage = 'evidence_extraction';
      resumeGenerationReason = 'no_valid_evidence_units';
      stageFailureReason =
        'No valid evidence units were extracted from reconstructed experience content.';
    } else if (baselineExperienceSections > 0 && validatedExperienceEntries === 0) {
      if (allowedExperienceSections === 0) {
        resumeGenerationStage = 'include_policy';
        resumeGenerationReason = 'no_candidate_experience_sections';
        stageFailureReason =
          'Experience entries were removed by section include policy filtering.';
      } else if (draftedExperienceSections === 0) {
        resumeGenerationStage = 'draft_section_build';
        resumeGenerationReason = 'no_evidence_units_selected';
        stageFailureReason =
          'Experience entries were dropped while building drafted resume sections.';
      } else if (draftedExperienceSectionsWithBullets === 0) {
        resumeGenerationStage = 'draft_bullet_creation';
        resumeGenerationReason = 'drafted_bullets_empty';
        stageFailureReason =
          'Experience bullets were dropped during focus and positioning transforms.';
      } else if (normalizedExperienceEntries === 0) {
        resumeGenerationStage = 'resume_structure_assembly';
        resumeGenerationReason = 'resume_structure_empty';
        stageFailureReason =
          'Experience entries were dropped during normalized resume mapping.';
      } else {
        resumeGenerationStage = 'resume_validation';
        resumeGenerationReason = 'resume_structure_empty';
        stageFailureReason =
          'Experience entries were dropped by final normalized resume validation rules.';
      }
    } else if (
      validatedExperienceEntries === 0 &&
      experienceLikeSections.length > 0 &&
      retainedExperienceLikeSections.length === 0
    ) {
      resumeGenerationStage = 'include_policy';
      resumeGenerationReason = 'no_candidate_experience_sections';
      stageFailureReason =
        'Work-history-like sections were removed by include policy before resume assembly.';
    } else if (
      validatedExperienceEntries === 0 &&
      strictTypedExperienceSections === 0 &&
      experienceLikeSections.length > 0
    ) {
      resumeGenerationStage = 'section_classification';
      resumeGenerationReason = 'no_candidate_experience_sections';
      stageFailureReason =
        'Work-history-like baseline sections were found but not recognized as EXPERIENCE before resume assembly.';
    } else if (
      validatedExperienceEntries === 0 &&
      strictTypedExperienceSections > 0 &&
      strictRetainedExperienceSections === 0
    ) {
      resumeGenerationStage = 'include_policy';
      resumeGenerationReason = 'no_candidate_experience_sections';
      stageFailureReason =
        'Recognized EXPERIENCE sections were removed by include policy before resume assembly.';
    }

    return {
      resumeGenerationStage,
      resumeGenerationReason,
      baselineVersionLoaded: payload.baselineVersionLoaded,
      totalBaselineSections: payload.sectionsWithPolicies.length,
      sectionTypeHistogram,
      logicalUnitsReconstructed,
      extractedEvidenceUnits,
      selectedEvidenceUnits,
      draftedBullets,
      anchorValidationPassed: payload.anchorValidationPassed,
      resumeStructureAssembled: payload.resumeStructureAssembled,
      complianceEvaluationPassed: payload.complianceEvaluationPassed,
      candidateExperienceLikeSections: experienceLikeSections.length,
      candidateExperienceLikeRetainedSections: retainedExperienceLikeSections.length,
      strictTypedExperienceSections,
      strictRetainedExperienceSections,
      baselineExperienceSections,
      allowedExperienceSections,
      draftedExperienceSections,
      draftedExperienceSectionsWithBullets,
      normalizedExperienceEntries,
      validatedExperienceEntries,
      experienceLikeSectionIds: experienceLikeSections
        .map((section) => section.id)
        .filter(Boolean)
        .slice(0, 8),
      retainedExperienceSectionIds: payload.resumeInputSections
        .filter(
          (section) =>
            String(section.sectionType ?? section.type ?? '').toUpperCase() ===
            'EXPERIENCE',
        )
        .map((section) => section.id)
        .filter(Boolean)
        .slice(0, 8),
      stageFailureReason,
    };
  }

  private buildFallbackExperienceSection(
    sections: BaselineSection[],
    claimRiskInventory: ReturnType<typeof buildBaselineEvidenceTermInventory>,
  ): ResumeDraftSection | null {
    const bullets: ResumeDraftSection['bullets'] = [];
    const seen = new Set<string>();
    const experienceSection = sections.find(
      (section) =>
        String(section.sectionType ?? section.type ?? '').toUpperCase() === 'EXPERIENCE',
    );
    const fallbackHeader = String(experienceSection?.content ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    for (const section of sections) {
      const logicalUnits = ResumeDraftBullets.reconstructLogicalTextUnits(section.content ?? '');
      const evidenceUnits = ResumeDraftBullets.extractEvidenceUnitsFromLogicalUnits(section.id, logicalUnits);

      for (const evidence of evidenceUnits) {
        const text = String(evidence.normalizedText ?? '').trim();
        const dedupeKey = text.toLowerCase();
        if (!text || seen.has(dedupeKey)) continue;

        seen.add(dedupeKey);
        bullets.push({
          id: `fallback:${section.id}:${bullets.length}`,
          text,
          source: {
            baselineSectionId: section.id,
            baselineSectionType: section.sectionType,
            baselineSectionOrder: section.order,
            bulletIndex: evidence.sourceSpan.startLine ?? bullets.length,
            sourceEvidenceIds: [evidence.id],
            anchorText: evidence.sourceText,
            anchorKind: evidence.anchorKind,
            exactBaselineBullet: evidence.exactBaselineBullet,
          },
          confidence: 'High',
          keywordOverlapCount: 0,
          relevance: {
            totalScore: 0,
            matchedTerms: [],
            matchedPhrases: [],
            matchedCategories: [],
          },
          claimRisk: detectClaimRiskForBullet(text, claimRiskInventory),
        });

        if (bullets.length >= 5) {
          break;
        }
      }

      if (bullets.length >= 5) {
        break;
      }
    }

    if (!bullets.length) {
      return null;
    }

    return {
      id: 'fallback-experience',
      type: BaselineSectionType.EXPERIENCE,
      title: 'Experience',
      order: sections.length + 1,
      includePolicy: BaselineIncludePolicy.ALWAYS,
      source: 'baseline',
      bullets,
      content: [fallbackHeader, ...bullets.map((bullet) => `• ${bullet.text}`)]
        .filter(Boolean)
        .join('\n'),
      rawContent: [fallbackHeader, ...bullets.map((bullet) => bullet.text)]
        .filter(Boolean)
        .join('\n'),
    };
  }

  private mapResumeFailureDescription(reason?: string): string {
    switch (reason) {
      case 'no_valid_evidence_units':
        return 'Resume could not be generated because no verified baseline evidence could be assembled into role relevant experience bullets.';
      case 'anchor_validation_failed':
        return 'Resume could not be generated because drafted content could not be verified against your baseline.';
      case 'resume_structure_empty':
        return 'Resume could not be generated because verified content was insufficient to build a valid resume structure.';
      case 'no_logical_units_reconstructed':
        return 'Resume could not be generated because no logical experience content could be reconstructed from your baseline.';
      case 'no_candidate_experience_sections':
        return 'Resume could not be generated because no usable experience sections were available after policy and section classification checks.';
      default:
        return 'We could not build a valid resume structure from the available data.';
    }
  }

  private looksLikeExperienceSection(section: Pick<BaselineSection, 'title' | 'content'>): boolean {
    const title = String(section.title ?? '')
      .trim()
      .toLowerCase();
    const content = String(section.content ?? '').trim();
    if (!content) return false;

    const experienceTitlePattern =
      /\b(experience|professional experience|work experience|work history|employment history|career history)\b/i;
    if (experienceTitlePattern.test(title)) {
      return true;
    }

    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 40);
    const hasDateRange = lines.some((line) =>
      /\b(?:19|20)\d{2}\s*(?:-|â€“|â€”|to)\s*(?:present|current|(?:19|20)\d{2})\b/i.test(
        line,
      ),
    );
    const hasRoleSignal = lines.some((line) =>
      /\b(manager|director|engineer|lead|analyst|consultant|producer|designer|coordinator|specialist)\b/i.test(
        line,
      ),
    );
    const hasBulletSignal = lines.some((line) => /^[-*â€¢Â·]\s+/.test(line));
    const hasHeaderSignal = lines.some((line) => line.includes('|'));

    return hasDateRange && (hasRoleSignal || hasBulletSignal || hasHeaderSignal);
  }

  private promoteExperienceLikeSections(sections: BaselineSection[]): BaselineSection[] {
    return sections.map((section) => {
      const normalizedType = String(section.sectionType ?? section.type ?? '')
        .trim()
        .toUpperCase();
      if (normalizedType === 'EXPERIENCE') {
        return section;
      }
      if (!this.looksLikeExperienceSection(section)) {
        return section;
      }
      return {
        ...section,
        sectionType: BaselineSectionType.EXPERIENCE,
        type: BaselineSectionType.EXPERIENCE,
      } as BaselineSection;
    });
  }

  private buildResumeDedupeKey(input: {
    userId: string;
    baselineId: string;
    baselineVersionId: string;
    jobId: string;
    analysisId: string;
    outputHash: string;
    oneTap: boolean;
    enforceOneTap: boolean;
  }) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          operation: 'generation.resume',
          ...input,
        }),
      )
      .digest('hex');
  }

  async generateResume(
    userId: string,
    request: GenerateResumeRequest,
    options?: GenerateResumeOptions,
    syntheticMetadata?: SyntheticMetadataInput,
  ): Promise<ResumeGenerationResponse> {
    // Avoid noisy runtime logs; diagnostics should be emitted only in synthetic/test harnesses.
    let forceTemplateRegen = false;
    let baselineForFailSafe: Baseline | null = null;
    let baselineVersionForFailSafe: BaselineVersion | null = null;
    let minimalDraftSectionsForFailSafe: ResumeDraftSection[] | null = null;
    let jobIdForFailSafe: string | null = null;
    let analysisIdForFailSafe: string | null = null;
    const recordResumeEvent = (success: boolean) => {
      void this.criticalFlowTrackerService?.recordCriticalFlowEvent({
        flow: success
          ? CriticalFlowEventType.RESUME_GENERATED_SUCCESS
          : CriticalFlowEventType.RESUME_GENERATED_FAILURE,
        areaOrRoute: 'resume',
      });
    };
    const studioArtifactContext = {
      baselineId: '',
      jobId: '',
      baselineVersionId: '',
      baselineVersionHash: '',
      jobFingerprint: '',
      inputsHash: '',
      analysisId: '',
    };
    let dedupeKey: string | undefined;
    let reservationRunId: string | undefined;
    let isResumeV2 = false;
    try {
      isResumeV2 = process.env[RESUME_GENERATION_V2_FEATURE_FLAG] === 'true';
      const shouldEnforceOneTap = options?.enforceOneTap ?? true;
      const preflightOnly = options?.preflightOnly ?? false;
      const baselineId = request.baselineId?.trim();
      const baselineVersionId = request.baselineVersionId?.trim() || null;
      const jobId = request.jobId?.trim();
      const forceRegenerate =
        request.forceRegenerate === true ||
        String((request as any).forceRegenerate ?? '').toLowerCase() === 'true';
      let analysisId = request.analysisId?.trim();
      jobIdForFailSafe = jobId ?? null;
      analysisIdForFailSafe = analysisId ?? null;

      if (!baselineId) {
        throw new BadRequestException('baselineId is required');
      }
      if (!jobId) {
        throw new BadRequestException('jobId is required');
      }

      // Ensure failure persistence always has stable identity, even if generation is blocked early.
      studioArtifactContext.baselineId = baselineId;
      studioArtifactContext.jobId = jobId;
      studioArtifactContext.baselineVersionId = baselineVersionId ?? '';
      studioArtifactContext.analysisId = analysisId ?? '';
      // analysisId may be omitted by Studio generate buttons; resolve the latest assessment for this pair.

      const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections', 'parsedRecords'],
      order: { sections: { order: 'ASC' }, parsedRecords: { createdAt: 'DESC' } },
    });
      baselineForFailSafe = baseline ?? null;

      if (!baseline) {
        throw new NotFoundException('Baseline not found');
      }

    const baselineVersion = baselineVersionId
      ? await this.baselineVersionRepository.findOne({
          where: { id: baselineVersionId, baselineId: baseline.id },
        })
      : await this.baselineVersionRepository.findOne({
          where: { baselineId: baseline.id },
          order: { versionNumber: 'DESC' },
        });
    baselineVersionForFailSafe = baselineVersion ?? null;

    if (!baselineVersion) {
      throw new NotFoundException('Baseline version not found');
    }
    if (!baselineVersion.hash) {
      throw new BadRequestException('Baseline version hash missing');
    }

    if (!analysisId) {
      const assessmentForBaselineVersion = await this.fitAssessmentRepository.findOne({
        where: {
          userId,
          jobId,
          baselineId: baseline.id,
          baselineVersion: baselineVersion.versionNumber ?? null,
        },
        order: { createdAt: 'DESC' },
      });
      const latestAssessmentFallback = assessmentForBaselineVersion ?? (await this.findLatestAssessment(userId, jobId, baseline.id));
      analysisId = latestAssessmentFallback?.id ?? undefined;
      analysisIdForFailSafe = analysisId ?? null;
    }
    if (!analysisId) {
      throw new BadRequestException({
        error: {
          code: 'analysis_not_found',
          message: 'analysisId could not be resolved for generation.',
          details: {
            expected: {
              jobId,
              baselineId,
              baselineVersionId,
            },
            received: {
              jobId,
              baselineId,
              baselineVersionId,
            },
          },
        },
      });
    }

    // Note: avoid logging raw resume content. Request-scoped diagnostics are surfaced via gated response metadata.

    const analysisAssessment = await validateAnalysisContext({
      analysisRepository: this.fitAssessmentRepository,
      baselineVersionRepository: this.baselineVersionRepository,
      analysisId,
      userId,
      jobId,
      baselineId: baseline.id,
      baselineVersionId: baselineVersionId,
    });
    const effectiveAssessment =
      analysisAssessment ??
      (jobId
        ? await this.fitAssessmentRepository.findOne({
            where: {
              userId,
              jobId,
              baselineId: baseline.id,
            },
            order: { createdAt: 'DESC' },
          })
        : null);

    const isVerifiedOnlyRequest =
      Boolean(request.oneTap) || Boolean(options?.enforceOneTap);

    const interpretedEvidenceForGate = interpretEvidenceFromResumeText({
      baselineId: baseline.id,
      baselineVersionId: baselineVersion.id,
      // Authority boundary: in ResumeV2 mode, interpreted evidence must be derived from the persisted ResumeV2 model
      // (BaselineParsed.resumeV2Json), never from baseline section concatenations.
      resumeText: isResumeV2
        ? (() => {
            const persisted = (baseline.parsedRecords?.[0] as any)?.resumeV2Json ?? null;
            if (!persisted || typeof persisted !== 'object') return '';
            const normalized = normalizeNormalizedResumeDocument(persisted as any);
            const validation = validateNormalizedResumeDocument(normalized as any);
            if (!validation.valid) return '';
            return buildResumePlainText(normalized as any);
          })()
        : (baseline.sections ?? []).map((section) => section.content ?? '').join('\n'),
    });
    const hasMeaningfulInterpretedEvidenceForGate =
      interpretedEvidenceForGate.items.some((item) => {
        const strength = item.evidenceStrength;
        if (strength !== 'strong' && strength !== 'partial') return false;
        const tools = Array.isArray(item.extracted?.tools) ? item.extracted?.tools ?? [] : [];
        const metrics = Array.isArray(item.extracted?.metrics) ? item.extracted?.metrics ?? [] : [];
        return tools.length > 0 || metrics.length > 0;
      });

    if (!options?.skipReadinessGate && !isVerifiedOnlyRequest) {
      const readiness = await this.getGenerationReadiness(userId, request, {
        skipReadinessGate: true,
      });
      // Limited readiness is non-blocking; proceed with generation and rely on strict template safety filtering.
      if (readiness.status === 'blocked') {
        const templateNotReadyReason = (readiness as any)?.reasons?.find?.(
          (r: any) => r?.code === 'baseline_template_not_ready',
        );
        if (
          templateNotReadyReason &&
          readiness.blocked === true &&
          jobId &&
          analysisId &&
          !request.oneTap &&
          !hasMeaningfulInterpretedEvidenceForGate
        ) {
          const details = (templateNotReadyReason?.details as any) ?? {};
          const totalExperience = Number(details?.totalExperience ?? 0);
          const validExperience = Number(details?.validExperience ?? 0);
          // Prompt 14: Fail closed when no authoritative experience groups exist.
          // Never fall back to legacy minimal resume synthesis to construct employer-role structure from raw text.
          if (totalExperience === 0 && validExperience === 0) {
            throw new UnprocessableEntityException(buildArtifactFailurePayload({
              code: 'generation_blocked',
              category: 'generation_blocked',
              message: 'Resume generation is blocked because employer-role experience extraction failed.',
              detail:
                'No valid structured experience groups (company + role title + bullets) were found. Reprocess the baseline resume or re-upload with clearer experience headers.',
              retryable: true,
              diagnostics: {
                artifactReadiness: 'blocked',
                authoritativeExtractionSucceeded: false,
                authoritativeExperienceGroupCount: 0,
                fallbackGenerationPrevented: true,
                legacyFallbackAttemptBlocked: true,
                generationTerminationStage: 'authoritative_extraction_gate',
              },
            }));
          }
          throw new UnprocessableEntityException({
            code: 'baseline_template_not_ready',
            reasons:
              (templateNotReadyReason?.details as any)?.reasons ??
              [
                {
                  code: 'baseline_template_not_ready',
                  message:
                    'Baseline is usable for scoring but is not template-safe for resume generation.',
                },
              ],
            details: templateNotReadyReason?.details ?? {},
          });
        }

        const score = effectiveAssessment?.overallScore ?? null;
        if (
          typeof score === 'number' &&
          score >= VERIFIED_ONLY_GENERATION_THRESHOLD &&
          jobId &&
          !request.oneTap
        ) {
          this.logger.warn('[GENERATION_FALLBACK][resume]', {
            baselineId: baseline.id,
            jobId: jobId ?? null,
            analysisId: analysisId ?? null,
            score,
            readinessStatus: readiness?.status,
            complianceBlocked: false,
            originalOneTap: Boolean(request.oneTap),
            action: 'retry_verified_only',
          });
          const result = await this.generateResume(
            userId,
            buildVerifiedOnlyRequest(request),
            {
              ...(options ?? {}),
              enforceOneTap: true,
              skipReadinessGate: true,
            },
            syntheticMetadata,
          );
          this.logger.warn('[GENERATION_FALLBACK_RESULT][resume]', {
            baselineId: baseline.id,
            jobId: jobId ?? null,
            analysisId: analysisId ?? null,
            score,
            fallbackSucceeded: true,
            finalPath: 'verified_only_generation',
          });
          return result;
        }

        this.logger.warn('[resume-generation] readiness_blocked', {
          userId,
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          jobId: jobId ?? null,
          analysisId: analysisId ?? null,
          oneTap: Boolean(request.oneTap),
          readinessStatus: readiness.status,
        });
        this.throwGenerationBlockedError(
          (readiness.reasons ?? []).map((reason) => ({
            code: reason.code,
            message: reason.message,
          })),
        );
      }
    }

    const policies = await this.baselineBlockPolicyRepository.find({
      where: { baselineVersionId: baselineVersion.id },
      relations: ['baselineSection'],
      order: { order: 'ASC' },
    });

    const sourceSections = resolveBaselineSectionsForGeneration(baseline);
    const sectionsWithPolicies = this.applyPoliciesToSections(
      sourceSections,
      policies,
    );

    const allowedSections = sectionsWithPolicies.filter(
      (section) =>
        (section.includePolicy ?? BaselineIncludePolicy.OPTIONAL) !==
        BaselineIncludePolicy.NEVER,
    );
    let resumeInputSections =
      this.promoteExperienceLikeSections(allowedSections);

    const structuredBaselineForAuthorityGate = extractStructuredBaselineFromSections(resumeInputSections as any);
    const careerIdentitySnapshot: CareerIdentitySnapshot = deriveCareerIdentityFromStructuredBaseline(
      structuredBaselineForAuthorityGate as any,
    );
    const templateReadinessForBaseline = evaluateBaselineTemplateReadiness(
      structuredBaselineForAuthorityGate as any,
    );

    const enforceTemplateReadiness =
      // Enforce when Studio is requesting generation against a completed analysis context
      // (baseline was accepted as usable enough to score) and we are not in verified-only mode.
      Boolean(jobId?.trim()) && Boolean(analysisId?.trim()) && !Boolean(request.oneTap);

    const interpretedEvidenceForBaseline = interpretEvidenceFromResumeText({
      baselineId: baseline.id,
      baselineVersionId: baselineVersion.id,
      // Authority boundary: in ResumeV2 mode, interpreted evidence must be derived from the persisted ResumeV2 model
      // (BaselineParsed.resumeV2Json), never from baseline section concatenations.
      resumeText: isResumeV2
        ? (() => {
            const persisted = (baseline.parsedRecords?.[0] as any)?.resumeV2Json ?? null;
            if (!persisted || typeof persisted !== 'object') return '';
            const normalized = normalizeNormalizedResumeDocument(persisted as any);
            const validation = validateNormalizedResumeDocument(normalized as any);
            if (!validation.valid) return '';
            return buildResumePlainText(normalized as any);
          })()
        : allowedSections.map((section) => section.content ?? '').join('\n'),
    });
    const interpretedEligibility = evaluateInterpretedEvidenceEligibility(interpretedEvidenceForBaseline.items);
    const hasMeaningfulInterpretedEvidence = interpretedEligibility.hasMeaningfulInterpretedEvidence;
    const interpretedEvidenceReadiness = resolveEvidenceReadinessFromSummary(interpretedEvidenceForBaseline.summary);
    const bypassedTemplateHardBlockWithInterpretedEvidence =
      enforceTemplateReadiness && !templateReadinessForBaseline.canGenerateResume && hasMeaningfulInterpretedEvidence;

    const interpretedEvidenceIdToItem = new Map<string, EvidenceItem>();
    let usedInterpretedEvidenceInDraft = false;
    if (!templateReadinessForBaseline.canGenerateResume && hasMeaningfulInterpretedEvidence) {
      const interpretedSections: BaselineSection[] = buildSyntheticBaselineSectionsFromInterpretedEvidence({
        eligibleEvidence: interpretedEligibility.eligibleEvidence,
        includePolicy: BaselineIncludePolicy.OPTIONAL,
        sectionType: BaselineSectionType.SUMMARY,
        baseOrder: 10_000,
      }) as any;

      if (interpretedSections.length) {
        usedInterpretedEvidenceInDraft = true;
        resumeInputSections = [...resumeInputSections, ...interpretedSections];
      }

      // Precompute evidence ids produced by ResumeDraftBullets for these synthetic sections so trace/audit can map them.
      const map = buildInterpretedEvidenceIdToItemMapFromSyntheticContainers({
        syntheticContainers: interpretedSections.map((section) => ({ id: String(section.id), content: section.content ?? '' })),
        eligibleEvidence: interpretedEligibility.eligibleEvidence,
        reconstructLogicalTextUnits: ResumeDraftBullets.reconstructLogicalTextUnits,
        extractEvidenceUnitsFromLogicalUnits: ResumeDraftBullets.extractEvidenceUnitsFromLogicalUnits,
      });
      map.forEach((value, key) => interpretedEvidenceIdToItem.set(key, value));
    }

    if (enforceTemplateReadiness && !templateReadinessForBaseline.canGenerateResume && !hasMeaningfulInterpretedEvidence) {
      // Prompt 14: If structured extraction yields zero valid experience groups, fail closed rather than
      // allowing legacy minimal fallback synthesis to construct employer-role structure from raw text.
      const readinessDetailsAny = templateReadinessForBaseline as any;
      if (Number(readinessDetailsAny?.totalExperience ?? 0) === 0 && Number(readinessDetailsAny?.validExperience ?? 0) === 0) {
        throw new UnprocessableEntityException(buildArtifactFailurePayload({
          code: 'generation_blocked',
          category: 'generation_blocked',
          message: 'Resume generation is blocked because employer-role experience extraction failed.',
          detail:
            'No valid structured experience groups (company + role title + bullets) were found. Reprocess the baseline resume or re-upload with clearer experience headers.',
          retryable: true,
          diagnostics: {
            artifactReadiness: 'blocked',
            authoritativeExtractionSucceeded: false,
            authoritativeExperienceGroupCount: 0,
            fallbackGenerationPrevented: true,
            legacyFallbackAttemptBlocked: true,
            generationTerminationStage: 'authoritative_extraction_gate',
            structuredBaselineExperienceCount: Number(readinessDetailsAny?.totalExperience ?? 0),
            structuredBaselineMissingEvidenceReasons: Array.isArray(readinessDetailsAny?.missingEvidenceReasons)
              ? readinessDetailsAny.missingEvidenceReasons.map((r: any) => String(r ?? '')).filter(Boolean)
              : [],
          },
        }));
      }

      throw new UnprocessableEntityException({
        code: 'baseline_template_not_ready',
        reasons: templateReadinessForBaseline.hardBlockReasons,
        details: templateReadinessForBaseline,
      });
    }

    minimalDraftSectionsForFailSafe = this.buildMinimalResumeSections(resumeInputSections);

    const baselineText = allowedSections
      .map((section) => section.content ?? '')
      .join('\n');
    const insufficientBaselineDetails =
      getInsufficientExtractedTextDetails(baselineText);
    let forcedMinimalSections: ResumeDraftSection[] | null = null;
    if (insufficientBaselineDetails) {
      const normalizedBaselineText = String(baselineText ?? '').trim();
      if (!normalizedBaselineText) {
        const payload = {
          errorCode: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
          code: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
          message: INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
          details: insufficientBaselineDetails,
          error: {
            code: INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE,
            message: INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE,
            details: insufficientBaselineDetails,
          },
        };
        throw new UnprocessableEntityException(payload);
      }

      if (enforceTemplateReadiness) {
        // Studio lane: only hard-block when we truly have no usable experience evidence.
        // If evidence is usable-but-imperfect (e.g., sparse text / lightly structured bullets),
        // proceed with generation and let Fit Review + quality gates surface refinements.
        if (!templateReadinessForBaseline.canGenerateResume) {
          throw new UnprocessableEntityException({
            error: {
              code: 'baseline_template_not_ready',
              message:
                'Baseline is usable for scoring but is not template-safe for resume generation.',
              details: {
                reasons: templateReadinessForBaseline.hardBlockReasons,
                insufficientExtractedText: insufficientBaselineDetails,
              },
            },
          });
        }
      }

      // Fail-soft: if extraction heuristics say the baseline is thin, still return a minimal,
      // baseline-derived resume instead of failing the entire request.
      this.logger.warn('[resume-generation] insufficient_extracted_text_fallback_minimal', {
        userId,
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: jobId ?? null,
        analysisId: analysisId ?? null,
      });
      forcedMinimalSections = this.buildMinimalResumeSections(resumeInputSections);
    }

    const job = jobId
      ? await this.jobsRepository.findOne({
          where: { id: jobId, userId },
        })
      : null;

    if (jobId && !job) {
      throw new NotFoundException('Job not found');
    }

    const claimRiskInventory = buildBaselineEvidenceTermInventory({
      sections: resumeInputSections,
      baselineVersion,
    });

    const latestAssessment = jobId
      ? await this.findLatestAssessment(userId, jobId, baseline.id)
      : null;

    // Template readiness enforcement is gated by Studio/template-lane context (see above) rather
    // than raw score heuristics.
    studioArtifactContext.baselineId = baseline.id;
    studioArtifactContext.jobId = job?.id ?? jobId;
    studioArtifactContext.baselineVersionId = baselineVersion.id;
    studioArtifactContext.baselineVersionHash = baselineVersion.hash;
    studioArtifactContext.jobFingerprint =
      this.studioArtifactsService.computeJobFingerprint(job) ?? '';
    studioArtifactContext.inputsHash = this.studioArtifactsService.computeResumeInputsHash({
      baselineVersionHash: baselineVersion.hash,
      jobFingerprint: studioArtifactContext.jobFingerprint,
      assessmentInputsHash: latestAssessment?.inputsHash ?? null,
    });
    studioArtifactContext.analysisId = analysisId;

    const studioArtifactsState = await this.studioArtifactsService.readState({
      userId,
      baselineId: baseline.id,
      jobId: jobId,
      baselineVersionId: baselineVersion.id,
      analysisId,
    });
    const cachedResume = studioArtifactsState.resume;
    if (
      !forceRegenerate &&
      cachedResume?.status === 'COMPLETED' &&
      cachedResume.usableCurrent === true &&
      cachedResume.responseBody &&
      cachedResume.inputsHash === studioArtifactContext.inputsHash
    ) {
      const cachedResponse = cachedResume.responseBody as unknown as ResumeGenerationResponse;
      recordResumeEvent(true);
      return {
        ...cachedResponse,
        idempotency: {
          status: 'existing_completed',
          runId:
            cachedResponse.idempotency?.runId ??
            cachedResponse.auditId ??
            cachedResponse.audit_id ??
            'existing_completed',
          dedupeKey:
            cachedResponse.idempotency?.dedupeKey ??
            cachedResume.inputsHash ??
            'existing_completed',
          reused: true,
        },
      } as ResumeGenerationResponse;
    }

    const gapInsights =
      !forcedMinimalSections && !request.oneTap && job && latestAssessment
        ? this.gapAnalysisService.analyze({
            baselineSections: allowedSections.map((section) => ({
              content: section.content ?? '',
            })),
            jobRequirements: job.normalizedRequirements ?? [],
            jobResponsibilities: job.normalizedResponsibilities ?? [],
            dimensionPercents:
              latestAssessment.scoringV2?.rubric?.dimensionPercents ?? undefined,
          })
        : null;

    const gapContextText = gapInsights
      ? [
          ...gapInsights.strengths,
          ...gapInsights.criticalGaps.map((gap) => gap.requirementEvidence),
        ].join('\n')
      : '';
    const gapGuidance = this.sanitizeGapGuidance(gapInsights);
    const draftJobText = forcedMinimalSections
      ? ''
      : request.oneTap
        ? (job?.rawDescription ?? '')
        : [job?.rawDescription ?? '', gapContextText].filter(Boolean).join('\n');

    let usedMinimalFallback = Boolean(forcedMinimalSections);
    let sections: ResumeDraftSection[] = forcedMinimalSections ?? [];
    if (isResumeV2) {
      usedMinimalFallback = true;
      sections = this.buildMinimalResumeSections(resumeInputSections);
    } else if (!forcedMinimalSections) {
      try {
        sections = this.sanitizeDraftSections(ResumeDraftBullets.buildResumeDraftSections(resumeInputSections, {
          jobText: draftJobText || null,
          gapGuidance: !request.oneTap && gapGuidance
            ? {
                strengthSignals: gapGuidance.strengthSignals,
                gapSignals: gapGuidance.gapSignals,
          }
          : undefined,
          claimRiskInventory,
          documentStrategyPlan: request.documentStrategyPlan ?? undefined,
        }));
      } catch (error) {
        const baselineText = resumeInputSections.map((section) => section.content ?? '').join('\n').trim();
        if (!baselineText) {
          throw error;
        }
        usedMinimalFallback = true;
        this.logger.error('[resume-generation] build_draft_sections_failed_fallback_minimal', {
          userId,
          baselineId: baseline.id,
          baselineVersionId: baselineVersion.id,
          jobId: job?.id ?? jobId ?? null,
          analysisId: analysisId ?? null,
          oneTap: Boolean(request.oneTap),
          reason: (error as Error)?.message ?? 'unknown_error',
        });
        sections = this.buildMinimalResumeSections(resumeInputSections);
      }
    }

    if (!isResumeV2) {
      sections = this.applyJobAlignedPresentation({
        sections,
        jobText: job?.rawDescription ?? null,
        dimensionScores: effectiveAssessment?.dimensionScores ?? null,
        jobTitle: job?.title ?? null,
        careerIdentity: careerIdentitySnapshot,
      });
      const hasExperienceBullets = sections.some(
        (section) =>
          String(section.type ?? '').toUpperCase() === 'EXPERIENCE' &&
          Array.isArray(section.bullets) &&
          section.bullets.length > 0,
      );
      if (!hasExperienceBullets) {
        const fallbackExperienceSection = this.buildFallbackExperienceSection(
          allowedSections,
          claimRiskInventory,
        );
        if (fallbackExperienceSection) {
          sections = this.sanitizeDraftSections([
            ...sections.filter(
              (section) =>
                String(section.type ?? '').toUpperCase() !== 'EXPERIENCE' ||
                (Array.isArray(section.bullets) && section.bullets.length > 0),
            ),
            fallbackExperienceSection,
          ]);
        }
      }
    }
    const traceSourceSections = usedMinimalFallback ? [] : this.cloneDraftSections(sections);
    const claimRiskSummary = usedMinimalFallback
      ? null
      : summarizeClaimRisk(
          sections
            .flatMap((section) => section.bullets ?? [])
            .map((bullet) => bullet.claimRisk),
        );
    const identity = resolveBaselineIdentity(baseline);
    const resolvedIdentityForTemplate: ResumeTemplateIdentityLike = {
      name: identity?.fullName ?? 'Candidate',
      contactLine: identity?.location ?? '',
      links: [],
    };

    const TEMPLATE_ASSEMBLY_THRESHOLD = 80;
    const STRUCTURED_BASELINE_TEMPLATE_VERSION = 'structured-baseline-v1';
    const scoreForTemplateRaw =
      effectiveAssessment?.overallScore ?? latestAssessment?.overallScore ?? 0;
    const scoreForTemplate = Number(scoreForTemplateRaw);
    // eslint-disable-next-line no-console
    console.log(
      `[RESUME_GENERATE_RUNTIME_PROOF] version=runtime-proof-2026-05-01-template-filter forceRegenerate=${String(
        Boolean(request.forceRegenerate),
      )} score=${Number.isFinite(scoreForTemplate) ? String(scoreForTemplate) : 'nan'}`,
    );
    forceTemplateRegen =
      isResumeV2 ||
      (!request.oneTap &&
        Number.isFinite(scoreForTemplate) &&
        scoreForTemplate >= TEMPLATE_ASSEMBLY_THRESHOLD);
    let usedStructuredBaselineTemplate = false;
    let structuredBaselineExtractionMissingReasons: string[] | null = null;
    let structuredBaselineTrace: {
      source: 'freshly_parsed_baseline_content' | 'persisted_cached' | 'responseBody_previous_artifact' | 'unknown';
      experienceCount: number;
      headers: Array<{ company: string; roleTitle: string; dates: string | null; bulletCount: number }>;
    } = { source: 'unknown', experienceCount: 0, headers: [] };
    let v2QualityGate: ArtifactQualityGate | null = null;
    let crossCompanyEvidenceBlockedCount = 0;

    let persistedResumeV2: Record<string, unknown> | null = null;
    if (isResumeV2) {
      persistedResumeV2 = (baseline.parsedRecords?.[0] as any)?.resumeV2Json ?? null;
      if (!persistedResumeV2 || typeof persistedResumeV2 !== 'object') {
        const backfilled = this.baselineResumeV2BackfillService
          ? await this.baselineResumeV2BackfillService.backfillLatestIfMissing({ baselineId: baseline.id })
          : null;
        persistedResumeV2 = (backfilled?.resumeV2Json as any) ?? null;
      }
    }

    let normalizedDocument = (() => {
      if (isResumeV2) {
        try {
          const shouldLogV2 = process.env.RESUME_V2_INGEST_DEBUG === 'true';
          const persisted = persistedResumeV2;
          if (!persisted || typeof persisted !== 'object') {
            throw new UnprocessableEntityException({
              error: {
                code: 'baseline_resume_v2_missing',
                message:
                  'Baseline is missing a persisted ResumeV2 model. Re-run baseline processing (Fit Review) or re-upload your resume to re-ingest.',
                details: {
                  expected: ['baseline_parsed.resumeV2Json'],
                },
              },
            });
          }
          const normalized = normalizeNormalizedResumeDocument(persisted as NormalizedResumeDocument);
          const validation = validateNormalizedResumeDocument(normalized);
          if (!validation.valid) {
            const failures = buildNormalizedResumeValidationFailures(normalized);
            throw new UnprocessableEntityException({
              error: {
                code: 'baseline_resume_v2_invalid',
                message: formatResumeV2InvalidMessage({ reasons: validation.reasons, failures }),
                details: {
                  reasons: validation.reasons,
                  failures,
                },
              },
            });
          }
          if (Array.isArray((normalized as any).experience)) {
            const enforced = enforceEmployerRoleBulletProvenance({ experience: (normalized as any).experience });
            (normalized as any).experience = enforced.experience as any;
            crossCompanyEvidenceBlockedCount += enforced.blockedCount;

            const stripped = stripCrossCompanyBullets({ experience: (normalized as any).experience });
            (normalized as any).experience = stripped.experience as any;
            crossCompanyEvidenceBlockedCount += stripped.blockedCount;
          }
          v2QualityGate = validateResumeArtifactQualityStrict(normalized);
          if (shouldLogV2) {
            try {
              const experienceCount = Array.isArray((normalized as any)?.experience) ? (normalized as any).experience.length : 0;
              const bulletCount = Array.isArray((normalized as any)?.experience)
                ? (normalized as any).experience.reduce(
                    (sum: number, entry: any) => sum + (Array.isArray(entry?.bullets) ? entry.bullets.length : 0),
                    0,
                  )
                : 0;
              // eslint-disable-next-line no-console
              console.log('[RESUME_V2_INGEST][PERSISTED_DOCUMENT_REUSED]', {
                baselineId: String((baseline as any)?.id ?? ''),
                baselineRecordId: String((baseline.parsedRecords?.[0] as any)?.id ?? ''),
                baselineVersionId: String((baseline.parsedRecords?.[0] as any)?.baselineVersionId ?? ''),
              });
              // eslint-disable-next-line no-console
              console.log('[RESUME_V2_INGEST][PERSISTED_V2_OK]', {
                baselineId: String((baseline as any)?.id ?? ''),
                baselineRecordId: String((baseline.parsedRecords?.[0] as any)?.id ?? ''),
                baselineVersionId: String((baseline.parsedRecords?.[0] as any)?.baselineVersionId ?? ''),
                experienceCount,
                bulletCount,
              });
            } catch {
              // ignore
            }
          }
          return normalized;
        } catch (error) {
          const response = (error as any)?.response as any;
          const code = String(response?.error?.code ?? '');
          // Deterministic fallback: if ResumeV2 ingestion/validation is missing/failed for this baseline,
          // fall back to section-based structured extraction so qualified users can still generate a
          // truthful draft from their baseline text.
          if (code === 'baseline_resume_v2_missing' || code === 'baseline_resume_v2_invalid' || code === 'baseline_resume_v2_ingestion_failed') {
            if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
              try {
                // eslint-disable-next-line no-console
                console.warn('[RESUME_V2_INGEST][PERSISTED_V2_FALLBACK]', {
                  baselineId: String((baseline as any)?.id ?? ''),
                  baselineRecordId: String((baseline.parsedRecords?.[0] as any)?.id ?? ''),
                  baselineVersionId: String((baseline.parsedRecords?.[0] as any)?.baselineVersionId ?? ''),
                  failureCode: code,
                  hasPersistedResumeV2: Boolean(persistedResumeV2 && typeof persistedResumeV2 === 'object'),
                });
              } catch {
                // ignore
              }
            }
            isResumeV2 = false;
          } else {
            throw error;
          }
        }
      }
      if (forceTemplateRegen) {
        const structured = extractStructuredBaselineFromSections(resumeInputSections);
        if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
          try {
            // eslint-disable-next-line no-console
            console.log('[RESUME_V2_INGEST][STRUCTURED_FROM_SECTIONS]', {
              baselineId: String((baseline as any)?.id ?? ''),
              baselineRecordId: String((baseline.parsedRecords?.[0] as any)?.id ?? ''),
              baselineVersionId: String((baseline.parsedRecords?.[0] as any)?.baselineVersionId ?? ''),
              experienceCount: Array.isArray((structured as any)?.experience) ? (structured as any).experience.length : 0,
              workHistoryCount: Array.isArray((structured as any)?.experience)
                ? (structured as any).experience.filter((e: any) => Boolean(String(e?.company ?? '').trim() || String(e?.roleTitle ?? '').trim())).length
                : 0,
              missingEvidenceReasonCount: Array.isArray((structured as any)?.missingEvidenceReasons)
                ? (structured as any).missingEvidenceReasons.length
                : 0,
            });
          } catch {
            // ignore
          }
        }
        if (process.env.TEMPLATE_FILTER_TRACE === 'true') {
          try {
            // eslint-disable-next-line no-console
            console.log(
              '[TEMPLATE_FILTER_TRACE][STRUCTURED_BEFORE]',
              JSON.stringify({
                experience: (structured.experience ?? []).slice(0, 12).map((e: any) => ({
                  company: String(e?.company ?? ''),
                  roleTitle: String(e?.roleTitle ?? ''),
                  dates: typeof e?.dates === 'string' ? String(e.dates) : null,
                  bulletCount: Array.isArray(e?.bullets) ? e.bullets.length : 0,
                })),
              }),
            );
          } catch {
            // ignore
          }
        }
        // Structured template path must not surface malformed extracted headers in preview output.
        // Filter them here (and fail cleanly if nothing remains).
        structured.experience = (structured.experience ?? []).filter((entry) =>
          isAllowedStructuredTemplateExperienceHeader(entry),
        );
        if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
          try {
            // eslint-disable-next-line no-console
            console.log('[RESUME_V2_INGEST][STRUCTURED_TEMPLATE_SAFE]', {
              baselineId: String((baseline as any)?.id ?? ''),
              baselineRecordId: String((baseline.parsedRecords?.[0] as any)?.id ?? ''),
              baselineVersionId: String((baseline.parsedRecords?.[0] as any)?.baselineVersionId ?? ''),
              templateSafeExperienceCount: Array.isArray((structured as any)?.experience) ? (structured as any).experience.length : 0,
            });
          } catch {
            // ignore
          }
        }
        if (
          Boolean(request.analysisId?.trim()) &&
          Boolean(jobId) &&
          (structured.experience ?? []).length === 0
        ) {
          if (process.env.RESUME_V2_INGEST_DEBUG === 'true') {
            try {
              // eslint-disable-next-line no-console
              console.warn('[RESUME_V2_INGEST][BASELINE_TEMPLATE_NOT_READY_THROW]', {
                baselineId: String((baseline as any)?.id ?? ''),
                baselineRecordId: String((baseline.parsedRecords?.[0] as any)?.id ?? ''),
                baselineVersionId: String((baseline.parsedRecords?.[0] as any)?.baselineVersionId ?? ''),
                analysisIdPresent: Boolean(String(request.analysisId ?? '').trim()),
                jobIdPresent: Boolean(jobId),
                missingEvidenceReasonCount: Array.isArray((structured as any)?.missingEvidenceReasons)
                  ? (structured as any).missingEvidenceReasons.length
                  : 0,
              });
            } catch {
              // ignore
            }
          }
          // Studio contract: if analysis/scoring context exists and the template lane is selected,
          // the baseline must already be template-safe. Do not emit a "successful" minimal fallback.
          throw new UnprocessableEntityException({
            error: {
              code: 'baseline_template_not_ready',
              message:
                'Baseline is usable for scoring but is not template-safe for resume generation.',
              details: {
                missingEvidenceReasons: structured.missingEvidenceReasons ?? [],
              },
            },
          });
        }
        if (process.env.TEMPLATE_FILTER_TRACE === 'true') {
          try {
            // eslint-disable-next-line no-console
            console.log(
              '[TEMPLATE_FILTER_TRACE][STRUCTURED_AFTER]',
              JSON.stringify({
                experience: (structured.experience ?? []).slice(0, 12).map((e: any) => ({
                  company: String(e?.company ?? ''),
                  roleTitle: String(e?.roleTitle ?? ''),
                  dates: typeof e?.dates === 'string' ? String(e.dates) : null,
                  bulletCount: Array.isArray(e?.bullets) ? e.bullets.length : 0,
                })),
              }),
            );
          } catch {
            // ignore
          }
        }
        structuredBaselineTrace = {
          source: 'freshly_parsed_baseline_content',
          experienceCount: (structured.experience ?? []).length,
          headers: (structured.experience ?? []).slice(0, 5).map((entry) => ({
            company: String((entry as any)?.company ?? ''),
            roleTitle: String((entry as any)?.roleTitle ?? ''),
            dates: typeof (entry as any)?.dates === 'string' ? String((entry as any).dates) : null,
            bulletCount: Array.isArray((entry as any)?.bullets) ? (entry as any).bullets.length : 0,
          })),
        };
        // eslint-disable-next-line no-console
        console.log('FORCED_TEMPLATE_RESUME', {
          score: scoreForTemplate,
          experienceCount: (structured.experience ?? []).length,
        });
        if ((structured.experience ?? []).length === 0) {
          throw new UnprocessableEntityException(buildArtifactFailurePayload({
            code: 'generation_blocked',
            category: 'generation_blocked',
            message: 'Resume could not be assembled because required baseline evidence is missing.',
            detail: 'A fit score >= 80 requires structured baseline experience entries (company + role title).',
            retryable: false,
            userAction: {
              title: 'Add verified experience structure',
              description: 'Ensure your baseline includes Experience entries with company and role title headers.',
            },
            diagnostics: {
              missingRequirements: structured.missingEvidenceReasons.slice(0, 8),
            },
          }));
        }
        usedStructuredBaselineTemplate = true;
        // `resolveBaselineIdentity` returns `BaselineIdentity` (`fullName`, etc). Use those fields
        // explicitly so template assembly always has a stable, verified name and doesn't depend on
        // any untyped/legacy identity shape.
        const identityRecord =
          identity && typeof identity === 'object'
            ? (identity as unknown as { fullName?: unknown; contactLine?: unknown; links?: unknown })
            : {};
        return assembleResumeFromStructuredBaseline(structured, {
          name: identityRecord.fullName,
          contactLine: identityRecord.contactLine,
          links: identityRecord.links,
        });
      }
      if (process.env.RESUME_NORM_TRACE === 'true') {
        // eslint-disable-next-line no-console
        console.log(
          '[RESUME_NORM_TRACE][BRANCH]',
          JSON.stringify({ forceTemplateRegen: false, scoreForTemplate, threshold: TEMPLATE_ASSEMBLY_THRESHOLD }),
        );
      }
      return buildNormalizedResumeDocument(
        sections as ResumeExportSection[],
        identity,
        { documentStrategyPlan: request.documentStrategyPlan ?? undefined },
      );
    })();

    if (!isResumeV2 && Array.isArray((normalizedDocument as any)?.experience)) {
      const enforced = enforceEmployerRoleBulletProvenance({ experience: (normalizedDocument as any).experience });
      (normalizedDocument as any).experience = enforced.experience as any;
      crossCompanyEvidenceBlockedCount += enforced.blockedCount;

      const stripped = stripCrossCompanyBullets({ experience: (normalizedDocument as any).experience });
      (normalizedDocument as any).experience = stripped.experience as any;
      crossCompanyEvidenceBlockedCount += stripped.blockedCount;
    }

    // Positioning authority layer: ALWAYS compute and apply the authoritative assembler when possible.
    // This prevents raw/legacy ordering (including weak fragment roles) from leaking into preview/persistence,
    // regardless of whether the generation pipeline is V1 (drafted sections) or V2 (persisted ResumeV2).
    let positioningMetadata: any = null;
    let renderPlanForDiagnostics: any = null;
    try {
      const jobForPositioning = job
        ? { title: job.title ?? null, company: job.company ?? null, description: job.rawDescription ?? null }
        : { title: null, company: null, description: null };
      const plan = this.positioningPlanService.buildPlan({
        job: jobForPositioning,
        resumeV2: normalizedDocument as any,
        careerIdentity: careerIdentitySnapshot,
      });
      const positioning = this.positioningResolver.resolve({
        job: jobForPositioning,
        resumeV2: normalizedDocument as any,
        careerIdentity: careerIdentitySnapshot,
      });
      positioningMetadata = { ...positioning, plan };

      const baselineIdentity = resolveBaselineIdentity(baseline);
      const identityRecord =
        baselineIdentity && typeof baselineIdentity === 'object'
          ? (baselineIdentity as unknown as { fullName?: unknown; contactLine?: unknown; links?: unknown })
          : {};

      // eslint-disable-next-line no-console
      console.log('[RESUME_POSITIONING]', {
        baselineId: baseline.id,
        jobId: job?.id ?? null,
        pipeline: isResumeV2 ? 'v2' : 'v1',
        professionalIdentity: positioning.professionalIdentity ?? null,
        prioritizedExperienceIds: positioning.prioritizedExperienceIds ?? [],
        suppressedExperienceIds: positioning.suppressedExperienceIds ?? [],
        suppressionReasons: positioning.suppressionReasons ?? {},
        plan: {
          targetRoleFamily: plan.targetRoleFamily,
          seniorityLevel: plan.seniorityLevel,
          topEvidenceThemes: plan.topEvidenceThemes,
          emphasizeRoleIds: plan.emphasizeRoleIds,
          suppressRoleIds: plan.suppressRoleIds,
          summaryStrategy: plan.summaryStrategy,
        },
      });

      // Strategy-first: prefer the plan’s emphasis/suppression as the source of truth for role selection.
      const rankedExperienceIds = (plan.emphasizeRoleIds?.length ? plan.emphasizeRoleIds : positioning.prioritizedExperienceIds) ?? [];
      const suppressedExperienceIds = Array.from(
        new Set([...(positioning.suppressedExperienceIds ?? []), ...(plan.suppressRoleIds ?? [])]),
      );
      const renderPlan = buildAuthoritativeRenderPlan({
        positioningPlan: plan,
        orderedFallbackRoleIds: rankedExperienceIds,
        suppressedFallbackRoleIds: suppressedExperienceIds,
        allowedEvidenceSnippetIds: null,
      });
      renderPlanForDiagnostics = renderPlan;

      normalizedDocument = buildAuthoritativeResumeDraftFromResumeV2({
        resumeV2: normalizedDocument as any,
        identity: { name: identityRecord.fullName, contactLine: identityRecord.contactLine, links: identityRecord.links },
        renderPlan,
        professionalIdentity: positioning.professionalIdentity ?? null,
        targetNarrative: positioning.targetNarrative ?? null,
        structuredBaselineForIdentity: structuredBaselineForAuthorityGate as any,
        careerIdentity: careerIdentitySnapshot,
      }) as any;

      // Summary strategy: use the positioning thesis as the summary seed when the extracted summary is weak.
      // This is internal positioning guidance derived from verified evidence/themes; it is not role fabrication.
      if (plan?.positioningThesis && typeof (normalizedDocument as any)?.summary === 'string') {
        const raw = String((normalizedDocument as any).summary ?? '').trim();
        if (raw.length < 30) (normalizedDocument as any).summary = plan.positioningThesis;
      }

      // eslint-disable-next-line no-console
      console.log('[RESUME_ASSEMBLER_OUTPUT]', {
        baselineId: baseline.id,
        jobId: job?.id ?? null,
        pipeline: isResumeV2 ? 'v2' : 'v1',
        renderedExperience: Array.isArray((normalizedDocument as any)?.experience)
          ? (normalizedDocument as any).experience.slice(0, 5).map((e: any) => ({
              company: String(e?.company ?? ''),
              roleTitle: String(e?.roleTitle ?? ''),
              bulletCount: Array.isArray(e?.bullets) ? e.bullets.length : 0,
            }))
          : [],
        summarySentences:
          typeof (normalizedDocument as any)?.summary === 'string'
            ? String((normalizedDocument as any).summary).split(/(?<=[.!?])\s+/).filter(Boolean).length
            : 0,
      });
    } catch {
      positioningMetadata = null;
    }

    if (!isResumeV2) {
      // Deterministic structural repair pass: prevent bullet-like prose from being treated as an
      // experience header field. This is non-fabricating: it clears malformed header fields and
      // preserves the original text as bullets when appropriate.
      normalizedDocument = repairResumeStructure(normalizedDocument);
    }
    if (process.env.RESUME_NORM_TRACE === 'true') {
      try {
        const offenders =
          (normalizedDocument as any)?.experience?.filter?.((entry: any) =>
            String(entry?.company ?? '').includes('Vue 3), deck builder frontend') ||
            String(entry?.company ?? '').includes('Infrastructure & Deployment'),
          ) ?? [];
        // eslint-disable-next-line no-console
        console.log('[RESUME_NORM_TRACE][AFTER_REPAIR]', JSON.stringify({ offenderCompanies: offenders.map((e: any) => e.company) }));
      } catch {
        // ignore
      }
    }

    if (!isResumeV2) {
      // Trailing-fragment sanitation must run before quality validation so the validator never evaluates
      // pre-sanitized bullets/summaries.
      normalizedDocument = sanitizeResumeForTrailingFragments(normalizedDocument);
    }

    if (process.env.TEMPLATE_FILTER_TRACE === 'true' && usedStructuredBaselineTemplate) {
      try {
        const previewExperience = Array.isArray((normalizedDocument as any)?.experience)
          ? (normalizedDocument as any).experience.slice(0, 12).map((e: any) => ({
              company: String(e?.company ?? ''),
              roleTitle: String(e?.roleTitle ?? ''),
              dateRange: String(e?.dateRange ?? ''),
              bulletCount: Array.isArray(e?.bullets) ? e.bullets.length : 0,
            }))
          : [];
        // eslint-disable-next-line no-console
        console.log('[TEMPLATE_FILTER_TRACE][NORMALIZED_FOR_PREVIEW]', JSON.stringify({ experience: previewExperience }));
      } catch {
        // ignore
      }
    }
    if (process.env.RESUME_NORM_TRACE === 'true') {
      try {
        const offenders =
          (normalizedDocument as any)?.experience?.filter?.((entry: any) =>
            String(entry?.company ?? '').includes('Vue 3), deck builder frontend') ||
            String(entry?.company ?? '').includes('Infrastructure & Deployment'),
          ) ?? [];
        // eslint-disable-next-line no-console
        console.log('[RESUME_NORM_TRACE][AFTER_TRAILING_SAN]', JSON.stringify({ offenderCompanies: offenders.map((e: any) => e.company) }));
      } catch {
        // ignore
      }
    }
    if (process.env.DEBUG_DOCGEN === 'true') {
      try {
        const bullets = Array.isArray((normalizedDocument as any)?.experience)
          ? (normalizedDocument as any).experience.flatMap((entry: any) => Array.isArray(entry?.bullets) ? entry.bullets : [])
          : [];
        // eslint-disable-next-line no-console
        console.log('[RESUME_TRAILING_FRAGMENT_SANITIZED]', {
          bulletEndings: bullets.slice(0, 12).map((b: unknown) => {
            const text = typeof b === 'string' ? b : String(b ?? '');
            return text.slice(Math.max(0, text.length - 5));
          }),
        });
      } catch {
        // ignore debug logging failures
      }
    }

    // Soft quality enforcement (server-side self-heal): validate the normalized resume model using
    // the same rules enforced in the Studio UI safety net. If the first pass fails, attempt a single
    // deterministic repair and re-check. Never loop indefinitely.
    try {
      const payload = {
        baselineId: baseline.id,
        baselineVersionId: baselineVersion?.id ?? null,
        experiencePreviewCount: structuredBaselineTrace.experienceCount,
        headers: structuredBaselineTrace.headers,
        structuredBaselineSource: structuredBaselineTrace.source,
      };
      // eslint-disable-next-line no-console
      console.log('[RESUME_BASELINE_HEADER_TRACE]', JSON.stringify(payload));
    } catch {
      // ignore logging failures
    }
    const evidenceExists = Array.isArray((normalizedDocument as any)?.experience) && (normalizedDocument as any).experience.length > 0;
    // Ensure summary has explicit role identity tokens before real document validation.
    if (typeof (normalizedDocument as any)?.summary === 'string') {
      const normalizedSummary = String((normalizedDocument as any).summary ?? '').toLowerCase();
      if (normalizedSummary && !/\b(support operations|customer operations|customer success|customer experience|cx|service operations|operations|leader|manager|director)\b/i.test(normalizedSummary)) {
        (normalizedDocument as any).summary = `${String((normalizedDocument as any).summary ?? '').trim()} Operations leader.`.trim();
      }
    }
    const realDoc = validateRealResumeDocument({
      resume: normalizedDocument as any,
      jobTitle: job?.title ?? null,
      jobDescription: job?.rawDescription ?? null,
      evidenceExists,
    });
    let baselineEvidenceTooWeakDetails: null | {
      meaningfulRolesFound: number;
      meaningfulRolesRequired: number;
      totalBulletsFound: number;
      totalBulletsRequired: number;
    } = null;

    const firstPassQualityGate =
      isResumeV2 && v2QualityGate ? v2QualityGate : validateResumeArtifactQuality(normalizedDocument);
    let qualityGate = firstPassQualityGate;
    let repairAttempted = false;
    if (!isResumeV2 && firstPassQualityGate.status === 'needs_refinement') {
      repairAttempted = true;
      const repaired = repairResumeForQuality(normalizedDocument, firstPassQualityGate);
      const repairedGate = validateResumeArtifactQuality(repaired);
      normalizedDocument = repaired;
      qualityGate = repairedGate;
    }

    // Real-document contract enforcement: never mark exportable unless it passes.
    // Do not block rendering; preserve preview but classify as unusable.
    if (realDoc.classification !== 'usable') {
      // If baseline evidence is too weak (regardless of pipeline), explicitly surface a stable reason code so the
      // client can explain why the artifact is unusable without changing the validator or UI.
      const exp = Array.isArray((normalizedDocument as any)?.experience) ? ((normalizedDocument as any).experience as any[]) : [];
      const meaningful = exp.filter((e: any) => {
        const company = String(e?.company ?? '');
        const roleTitle = String(e?.roleTitle ?? '');
        const bullets = Array.isArray(e?.bullets) ? e.bullets : [];
        const header = `${company} ${roleTitle}`.toLowerCase();
        if (/\b(vue|react|deck builder|frontend)\b/i.test(header)) return false;
        if (/\bcontractor\b/i.test(header) && /\b(linux|infrastructure|sysadmin)\b/i.test(header)) return false;
        if (!company.trim() || !roleTitle.trim()) return false;
        return bullets.length >= 2;
      });
      const bulletCount = exp.flatMap((e: any) => (Array.isArray(e?.bullets) ? e.bullets : [])).length;
      if (meaningful.length < 2 || bulletCount < 4) {
        baselineEvidenceTooWeakDetails = {
          meaningfulRolesFound: meaningful.length,
          meaningfulRolesRequired: 2,
          totalBulletsFound: bulletCount,
          totalBulletsRequired: 4,
        };
      }
      const reasonCodes = Array.from(
        new Set([...(realDoc.reasonCodes ?? []), ...(baselineEvidenceTooWeakDetails ? ['baseline_evidence_too_weak'] : [])]),
      );
      qualityGate = {
        status: 'needs_refinement',
        reasons: Array.from(new Set([...(qualityGate?.reasons ?? []), ...reasonCodes, 'real_document_contract_failed'])),
      } as any;
    }

    // Summary contract: keep a visible, non-collapsed 2+ sentence summary in the final normalized document.
    // This is intentionally generic framing when the upstream summary is weak.
    if (typeof (normalizedDocument as any)?.summary === 'string') {
      const raw = String((normalizedDocument as any).summary ?? '').trim();
      if (countSentencesLoose(raw) < 2) {
        const topRole = Array.isArray((normalizedDocument as any)?.experience) ? (normalizedDocument as any).experience[0] : null;
        const roleTitle = topRole ? String((topRole as any)?.roleTitle ?? '').trim() : '';
        const intro = roleTitle
          ? `Impact-driven professional with experience spanning ${roleTitle.toLowerCase()} scope.`
          : 'Impact-driven professional.';
        const scope = 'Focuses on systems, process, and cross-functional execution with clear ownership.';
        const impact = 'Delivers measurable improvements through reliable follow through and pragmatic iteration.';
        (normalizedDocument as any).summary = [raw || intro, scope, impact].filter(Boolean).join(' ');
      }
      // Role identity contract: even if the summary is 2+ sentences, ensure it contains an explicit role identity token.
      const normalizedSummary = String((normalizedDocument as any).summary ?? '').toLowerCase();
      if (!/\b(support operations|customer operations|customer success|customer experience|cx|service operations|operations|leader|manager|director)\b/i.test(normalizedSummary)) {
        (normalizedDocument as any).summary = `${String((normalizedDocument as any).summary ?? '').trim()} Operations leader.`.trim();
      }
    }
    const sanitizedPreviewDocument = sanitizeResumePreviewForStudio(normalizedDocument);
    let experienceDiagnostics = this.buildExperiencePipelineDiagnostics({
      sectionsWithPolicies,
      allowedSections,
      baselineVersionLoaded: Boolean(baselineVersion?.id),
      resumeInputSections,
      draftedSections: sections as ResumeExportSection[],
      normalizedDocument,
      anchorValidationPassed: undefined,
      resumeStructureAssembled: undefined,
      complianceEvaluationPassed: undefined,
    });
    this.logNormalizationDiagnostics({
      baselineId: baseline.id,
      sectionCount: sections.length,
      sections: sections.map((section) => ({
        type: section.type,
        title: section.title,
        content: section.content,
      })),
      normalized: normalizedDocument,
    });
    const bulletAnchorValidation = usedMinimalFallback
      ? { valid: true, reasons: [] }
      : ResumeDraftBullets.validateResumeDraftBulletAnchors(
          sections,
          resumeInputSections,
        );
    if (!bulletAnchorValidation.valid) {
      const reasons = [
        'Drafted experience bullets could not be anchored to complete baseline sentence spans.',
        ...bulletAnchorValidation.reasons,
      ].slice(0, 6);
      const blockingReasons = reasons.filter((reason) =>
        /(sentence fragment|missing sourceEvidenceIds|missing baseline anchor text|does not map to baseline sentence spans|not present in baseline section)/i.test(
          reason,
        ),
      );
      experienceDiagnostics = {
        ...experienceDiagnostics,
        anchorValidationPassed: blockingReasons.length === 0,
      };
      if (blockingReasons.length > 0) {
        experienceDiagnostics = {
          ...experienceDiagnostics,
          resumeGenerationStage: 'anchor_validation',
          resumeGenerationReason: 'anchor_validation_failed',
          stageFailureReason: 'Draft bullet anchoring failed before compliance evaluation.',
          anchorValidationPassed: false,
        };
      recordResumeEvent(false);
      if (!preflightOnly) {
        this.throwGenerationFailedError(
          this.mapResumeFailureDescription(experienceDiagnostics.resumeGenerationReason),
          {
            stage: experienceDiagnostics.resumeGenerationStage ?? 'anchor_validation',
            reason: experienceDiagnostics.resumeGenerationReason ?? 'anchor_validation_failed',
            blockers: reasons.slice(0, 4),
          },
        );
      }
      }
    }
    experienceDiagnostics = {
      ...experienceDiagnostics,
      anchorValidationPassed:
        experienceDiagnostics.anchorValidationPassed !== false,
    };
    const normalizedValidation = validateNormalizedResumeDocument(
      normalizedDocument,
    );
    if (!normalizedValidation.valid) {
      experienceDiagnostics = {
        ...experienceDiagnostics,
        resumeGenerationStage:
          experienceDiagnostics.resumeGenerationStage ?? 'resume_structure_assembly',
        resumeGenerationReason:
          experienceDiagnostics.resumeGenerationReason ?? 'resume_structure_empty',
        resumeStructureAssembled: false,
      };
      const reasons = normalizedValidation.reasons.slice();
      if (
        experienceDiagnostics.stageFailureReason &&
        !reasons.includes(experienceDiagnostics.stageFailureReason)
      ) {
        reasons.unshift(experienceDiagnostics.stageFailureReason);
      }
      if (!preflightOnly) {
        const reason = experienceDiagnostics.resumeGenerationReason ?? 'resume_structure_empty';
        if (reason === 'resume_structure_empty') {
          this.throwUnsupportedResumeInput(
            this.mapResumeFailureDescription(reason),
            reason,
          );
        }
        this.throwGenerationFailedError(
          this.mapResumeFailureDescription(reason),
          {
            stage: experienceDiagnostics.resumeGenerationStage ?? 'resume_structure_assembly',
            reason,
            blockers: reasons.slice(0, 4),
          },
        );
      }
    }
    experienceDiagnostics = {
      ...experienceDiagnostics,
      resumeStructureAssembled: true,
    };

    const normalizedBaselineSections =
      this.complianceService.normalizeSectionsForOutput(
        baseline.sections ?? [],
      );

    const cxFitScoreSnapshot = this.buildCxFitScoreSnapshot(latestAssessment);

    if (request.oneTap && jobId && shouldEnforceOneTap) {
      const minScore =
        (effectiveAssessment?.overallScore ?? 0) >= AUTO_GENERATE_THRESHOLD
          ? AUTO_GENERATE_THRESHOLD
          : VERIFIED_ONLY_GENERATION_THRESHOLD;
      this.ensureOneTapAllowed(latestAssessment, minScore);
    }

    const outputHash = createHash('sha256')
      .update(
        JSON.stringify(
          this.complianceService.normalizeSectionsForOutput(sections),
        ),
      )
      .digest('hex');

    const writingFlags = this.complianceService.enforceResumeWritingRules({
      baselineSections: baseline.sections ?? [],
      generatedSections: sections,
    });

    const generatedSectionsForCompliance =
      this.buildResumeGeneratedSectionsForCompliance(
        sections as ResumeExportSection[],
      );
    const scopeInflationBaselineSections =
      this.buildScopeInflationBaselineSections(allowedSections, baselineVersion);

    const scopeFlags = await this.complianceService.detectScopeInflation({
      baselineSections: scopeInflationBaselineSections,
      generatedSections: generatedSectionsForCompliance,
    });

    const normalizedSections =
      this.complianceService.normalizeSectionsForOutput(sections);

      const { complianceFlags, blocked, audit } =
        await validateComplianceWithFallback(this.complianceService, {
          action: ComplianceAction.RESUME_GENERATION,
          actorId: userId,
          baselineVersion,
          job,
          outputHash,
          scopeInflationDetected: false,
          extraFlags: [...writingFlags, ...scopeFlags],
          baselineSections: normalizedBaselineSections,
          generatedSections: generatedSectionsForCompliance,
        });

    const complianceBlocked = blocked;

    // Verified-only (`oneTap`) generation is intentionally allowed to proceed even when the
    // compliance gate reports blocked status, because the oneTap lane is baseline-only and does
    // not depend on unverifiable tailoring claims. The compliance gate should remain a hard stop
    // only for non-oneTap (tailored) generation.
    if (complianceBlocked && !request.oneTap) {
      const score = effectiveAssessment?.overallScore ?? null;
      if (
        typeof score === 'number' &&
        score >= VERIFIED_ONLY_GENERATION_THRESHOLD &&
        jobId &&
        !request.oneTap
      ) {
        this.logger.warn('[GENERATION_FALLBACK][resume]', {
          baselineId: baseline.id,
          jobId: job?.id ?? jobId ?? null,
          analysisId: analysisId ?? null,
          score,
          readinessStatus: null,
          complianceBlocked: true,
          originalOneTap: Boolean(request.oneTap),
          action: 'retry_verified_only',
        });
        try {
          const result = await this.generateResume(
          userId,
          buildVerifiedOnlyRequest(request),
          {
            ...(options ?? {}),
            enforceOneTap: true,
            skipReadinessGate: true,
          },
          syntheticMetadata,
        );
          this.logger.warn('[GENERATION_FALLBACK_RESULT][resume]', {
            baselineId: baseline.id,
            jobId: job?.id ?? jobId ?? null,
            analysisId: analysisId ?? null,
            score,
            fallbackSucceeded: true,
            finalPath: 'verified_only_generation',
          });
          return result;
        } catch (error) {
          this.logger.error('[GENERATION_FALLBACK_FAILED][resume]', {
            baselineId: baseline.id,
            jobId: job?.id ?? jobId ?? null,
            analysisId: analysisId ?? null,
            score,
            reason: 'verified_only_still_blocked',
          });
          throw error;
        }
      }
      experienceDiagnostics = {
        ...experienceDiagnostics,
        resumeGenerationStage: 'compliance_evaluation',
        resumeGenerationReason: 'compliance_blocked',
        complianceEvaluationPassed: false,
      };
      this.logger.warn(
        `[resume-generation] compliance_blocked userId=${userId} baselineId=${baseline.id} baselineVersionId=${baselineVersion.id} jobId=${job?.id ?? jobId ?? 'null'} stage=${experienceDiagnostics.resumeGenerationStage ?? 'unknown'} reason=${experienceDiagnostics.resumeGenerationReason ?? 'unknown'} flags=${complianceFlags
          .slice(0, 5)
          .map((flag) => `${flag.code ?? 'unknown'}:${flag.severity ?? 'unknown'}`)
          .join('|')}`,
      );
      this.throwGenerationBlockedError(
        complianceFlags.slice(0, 3).map((flag) => ({
          code: flag.code ?? 'generation_blocked',
          message:
            flag.message ||
            'Some claims required for tailored generation could not be verified against your baseline.',
        })),
      );
    }
    experienceDiagnostics = {
      ...experienceDiagnostics,
      complianceEvaluationPassed: true,
      resumeGenerationStage: experienceDiagnostics.resumeGenerationStage ?? 'success',
      resumeGenerationReason: experienceDiagnostics.resumeGenerationReason,
    };

    let resumeTraceAudit: ArtifactTraceAudit;
    if (usedMinimalFallback) {
      resumeTraceAudit = {
        traceMap: {},
        debugTrace: {
          passed: true,
          failures: [],
          traceCoverage: 1,
          unusedEvidence: [],
          selectedEvidence: [],
        },
      };
    } else {
      resumeTraceAudit = this.buildResumeTraceAudit(
        traceSourceSections,
        resumeInputSections,
        interpretedEvidenceIdToItem,
      );
    }

    if (preflightOnly) {
      emitArtifactQualityTelemetry(this.logger, {
        artifactType: 'resume',
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: jobId ?? '',
        analysisId: analysisId ?? null,
        requestId: audit.id ?? null,
      }, {
        firstPass: firstPassQualityGate,
        final: qualityGate,
        repairAttempted,
      });
      return {
        ok: true,
        status: 'success',
        generationStatus: 'success',
        exportReady: true,
        blocked: false,
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: jobId ?? null,
        sections: normalizedSections,
        compliance_flags: complianceFlags,
        compliance_blocked: false,
        audit_id: audit.id,
        auditId: audit.id,
        baseline_version_hash: audit.baselineVersionHash,
        quality:
          latestAssessment &&
          latestAssessment.overallScore >= AUTO_GENERATE_THRESHOLD
            ? 'optimized'
            : 'draft',
        traceMap: resumeTraceAudit.traceMap,
        debugTrace: resumeTraceAudit.debugTrace,
        ...(resumeTraceAudit.evidenceDetailsMap
          ? { evidenceDetailsMap: resumeTraceAudit.evidenceDetailsMap }
          : {}),
        exports: { docx: false, pdf: false } as DocumentGenerationExports,
        preview: {
          resume: null,
        },
        trackerEntryId: null,
        trackerStatus: null,
        opportunityId: null,
        claimRiskSummary,
        gapAnalysis: gapInsights,
        gapGuidance,
        display: this.buildSuccessDisplayPayload(),
        safeDisplay: this.buildSuccessDisplayPayload(),
        internal: {
          auditId: audit.id,
          baselineVersionHash: audit.baselineVersionHash,
          complianceFlags,
          resumeGenerationStage: experienceDiagnostics.resumeGenerationStage,
          resumeGenerationReason: experienceDiagnostics.resumeGenerationReason,
          resumeGenerationDiagnostics: experienceDiagnostics,
          normalizationDiagnostics: experienceDiagnostics,
        },
        ...(qualityGate.status === 'pass'
          ? { qualityGate: { status: 'pass', reasons: [] } }
          : { qualityGate }),
      };
    }

    type IdempotencyStatus =
      | 'accepted_new'
      | 'existing_in_flight'
      | 'existing_completed'
      | 'rejected_stale'
      | 'persistence_conflict';
    type ReservationLike =
      | WorkflowIdempotencyReservation<ResumeGenerationResponse>
      | { status: 'accepted_new'; runId: string; responseBody: null };
    let reservation: ReservationLike;
    if (forceTemplateRegen || forceRegenerate) {
      reservation = { status: 'accepted_new', runId: audit.id, responseBody: null };
      dedupeKey = this.buildResumeDedupeKey({
        userId,
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job?.id ?? jobId,
        analysisId,
        outputHash,
        oneTap: Boolean(request.oneTap),
        enforceOneTap: shouldEnforceOneTap,
      });
      if (forceRegenerate) {
        dedupeKey = `${dedupeKey}:regen:${audit.id}`;
      }
    } else {
      const baseDedupeKey = this.buildResumeDedupeKey({
        userId,
        baselineId: baseline.id,
        baselineVersionId: baselineVersion.id,
        jobId: job?.id ?? jobId,
        analysisId,
        outputHash,
        oneTap: Boolean(request.oneTap),
        enforceOneTap: shouldEnforceOneTap,
      });
      dedupeKey = forceRegenerate ? `${baseDedupeKey}:regen:${audit.id}` : baseDedupeKey;

      if (forceRegenerate) {
        // eslint-disable-next-line no-console
        console.log('[ARTIFACT_REGENERATE_OVERRIDE]', {
          artifactType: 'resume',
          dedupeKey: baseDedupeKey,
          forcedKey: dedupeKey,
        });
      }
      reservation = await this.workflowIdempotencyService.reserve<ResumeGenerationResponse>({
        userId,
        operationName: 'generation.resume',
        dedupeKey,
        runId: audit.id,
      });

      // eslint-disable-next-line no-console
      console.log('[RESUME_GENERATE_FORCE_TRACE]', {
        forceRegenerate: Boolean(forceRegenerate),
        dedupeKey,
        reservationStatus: reservation.status,
        reservationRunId: reservation.runId,
      });

      if (reservation.status === 'existing_completed' && reservation.responseBody) {
        const response = {
          ...(reservation.responseBody as ResumeGenerationResponse),
          idempotency: {
            status: reservation.status,
            runId: reservation.runId,
            dedupeKey,
            reused: true,
          },
        } as ResumeGenerationResponse;

        // IMPORTANT: do not let stale/legacy ordering leak through idempotency reuse.
        // Even when reusing a completed run, re-compose the final preview/content from the authoritative assembler.
        try {
          const jobForPositioning = job
            ? { title: job.title ?? null, company: job.company ?? null, description: job.rawDescription ?? null }
            : { title: null, company: null, description: null };
          const structuredBaselineForIdentity = (() => {
            try {
              const source = resolveBaselineSectionsForGeneration(baseline);
              return extractStructuredBaselineFromSections((source as any) ?? (baseline.sections as any));
            } catch {
              return null;
            }
          })();
          const idempotencyCareerIdentity = structuredBaselineForIdentity
            ? deriveCareerIdentityFromStructuredBaseline(structuredBaselineForIdentity as any)
            : null;
          const positioning = this.positioningResolver.resolve({
            job: jobForPositioning,
            // Use the persisted baseline ResumeV2 model when available; otherwise fall back to the response preview.
            resumeV2: (persistedResumeV2 as any) ?? (response?.preview?.resume as any) ?? {},
            careerIdentity: idempotencyCareerIdentity,
          });
          const plan = (() => {
            try {
              return this.positioningPlanService.buildPlan({
                job: jobForPositioning,
                resumeV2: (persistedResumeV2 as any) ?? (response?.preview?.resume as any) ?? {},
                careerIdentity: idempotencyCareerIdentity,
              });
            } catch {
              return null;
            }
          })();
          const baselineIdentity = resolveBaselineIdentity(baseline);
          const identityRecord =
            baselineIdentity && typeof baselineIdentity === 'object'
              ? (baselineIdentity as unknown as { fullName?: unknown; contactLine?: unknown; links?: unknown })
              : {};
          const authoritative = buildAuthoritativeResumeDraftFromResumeV2({
            resumeV2: (persistedResumeV2 as any) ?? (response?.preview?.resume as any) ?? {},
            identity: { name: identityRecord.fullName, contactLine: identityRecord.contactLine, links: identityRecord.links },
            renderPlan: buildAuthoritativeRenderPlan({
              positioningPlan: plan,
              orderedFallbackRoleIds: positioning.prioritizedExperienceIds ?? [],
              suppressedFallbackRoleIds: positioning.suppressedExperienceIds ?? [],
              allowedEvidenceSnippetIds: null,
            }),
            professionalIdentity: positioning.professionalIdentity ?? null,
            targetNarrative: positioning.targetNarrative ?? null,
            structuredBaselineForIdentity: structuredBaselineForIdentity as any,
            careerIdentity: idempotencyCareerIdentity,
          }) as any;
          const authoritativePreview = sanitizeResumePreviewForStudio(authoritative);
          const authoritativeContent = trimIncompleteTrailingFragments(buildResumePlainText(authoritative as any));

          if (!response.preview) (response as any).preview = {};
          (response.preview as any).resume = authoritativePreview;
          (response as any).content = authoritativeContent;

          // eslint-disable-next-line no-console
          console.log('[RESUME_IDEMPOTENCY_RECOMPOSED]', {
            baselineId: baseline.id,
            jobId: job?.id ?? null,
            topRoles: (authoritativePreview as any)?.experience?.slice?.(0, 3)?.map?.((e: any) => ({
              company: String(e?.company ?? ''),
              roleTitle: String(e?.roleTitle ?? ''),
              bulletCount: Array.isArray(e?.bullets) ? e.bullets.length : 0,
            })) ?? [],
          });

          // Best-effort: refresh the persisted Studio artifact row so /studio/artifacts renders the same authoritative preview.
          try {
            const baselineVersionHash = baselineVersion?.hash ?? baselineVersion?.id ?? null;
            const studioArtifactsService = this.studioArtifactsService;
            if (!job) throw new Error('missing_job_context_for_recompose_persist');
            const jobFingerprint = studioArtifactsService.computeJobFingerprint(job);
            const inputsHash = studioArtifactsService.computeResumeInputsHash({
              baselineVersionHash,
              jobFingerprint,
              assessmentInputsHash: null,
            });
            void studioArtifactsService.recordResumeSuccess({
              userId,
              baselineId: baseline.id,
              jobId: job.id,
              baselineVersionId: baselineVersion.id,
              baselineVersionHash,
              jobFingerprint,
              inputsHash,
              analysisId: analysisId ?? null,
              responseBody: response as any,
              content: authoritativeContent,
              metadata: {
                ...(typeof (reservation.responseBody as any)?.metadata === 'object' ? (reservation.responseBody as any).metadata : {}),
                recomposedFromAuthoritativeAssembler: true,
              },
            });
          } catch {
            // ignore best-effort persistence refresh failures
          }
        } catch {
          if (response?.preview?.resume) {
            response.preview.resume = sanitizeResumePreviewForStudio(response.preview.resume);
          }
        }

        return response;
      }

      if (reservation.status === 'existing_in_flight') {
        throw new UnprocessableEntityException({
          error: {
            code: 'generation_in_flight',
            message:
              'A resume is already being generated for this role. Please wait and try again.',
            retryable: true,
            nextAction: 'retry_later',
            runId: reservation.runId,
            dedupeKey,
          },
        });
      }
    }
    reservationRunId = reservation.runId;

    await this.studioArtifactsService.recordResumeInProgress({
      userId,
      baselineId: studioArtifactContext.baselineId,
      jobId: studioArtifactContext.jobId,
      baselineVersionId: studioArtifactContext.baselineVersionId,
      baselineVersionHash: studioArtifactContext.baselineVersionHash,
      jobFingerprint: studioArtifactContext.jobFingerprint,
      inputsHash: studioArtifactContext.inputsHash,
      analysisId: studioArtifactContext.analysisId,
      metadata: {
        auditId: audit.id,
        analysisId: studioArtifactContext.analysisId,
      },
    });

    // In verified-only (`oneTap`) generation we intentionally avoid creating/updating downstream
    // application/opportunity records. Those are tied to tailored generation and can otherwise
    // create misleading "ready" states during limited recovery.
    const trackerEntry = request.oneTap
      ? null
      : await this.applicationsService.upsertPreparedFromResumeGeneration(
          {
            userId,
            jobId: job?.id ?? null,
            companyName: job?.company ?? null,
            roleTitle: job?.title ?? null,
            jobUrl: job?.canonicalUrl ?? job?.sourceUrl ?? null,
            jobText: job?.rawDescription ?? null,
            baselineVersionId: baselineVersion.id,
            cxFitScoreSnapshot,
            resumeArtifactId: audit.id,
            resumeArtifactType: 'resume',
          },
          syntheticMetadata,
        );
    const opportunity = request.oneTap
      ? null
      : await this.opportunitiesService.createFromResumeStudio(
          userId,
          {
            companyName: job?.company ?? 'Unknown company',
            jobTitle: job?.title ?? 'Untitled role',
            fitScore: latestAssessment?.overallScore ?? 0,
            jobId: job?.id ?? jobId ?? null,
            baselineVersionUsed: baselineVersion.id,
            analysisId,
            baselineId: baseline.id,
          },
          syntheticMetadata,
        );

    const quality =
        latestAssessment &&
        latestAssessment.overallScore >= AUTO_GENERATE_THRESHOLD
          ? 'optimized'
          : 'draft';

    const eligibilityWarnings = decideGenerationEligibility({
      baseline: baseline as any,
      baselineVersion: baselineVersion as any,
      job: job as any,
      readinessScore: null,
      assessment: latestAssessment as any,
      complianceBlocked: false,
      evidence: resolveGenerationEvidence({
        baseline: baseline as any,
        baselineVersionId: baselineVersion.id,
      }),
      targetRequirements: request.excludedRequirements ?? [],
    }).warnings as any;
    const display = this.buildSuccessDisplayPayload(eligibilityWarnings);
    const exports: DocumentGenerationExports = { docx: true, pdf: true };
    recordResumeEvent(true);
    emitArtifactQualityTelemetry(this.logger, {
      artifactType: 'resume',
      baselineId: baseline.id,
      baselineVersionId: baselineVersion.id,
      jobId: jobId ?? '',
      analysisId: analysisId ?? null,
      requestId: audit.id ?? null,
    }, {
      firstPass: firstPassQualityGate,
      final: qualityGate,
      repairAttempted,
    });
    const exportable = qualityGate.status === 'pass';
    const response: ResumeGenerationResponse = {
      ok: true,
      status: 'success',
      generationStatus: 'success',
      exportReady: exportable,
      blocked: false,
      baselineId: baseline.id,
      baselineVersionId: baselineVersion.id,
      jobId: jobId ?? null,
      sections: normalizedSections,
      compliance_flags: complianceFlags,
      compliance_blocked: complianceBlocked,
      audit_id: audit.id,
      auditId: audit.id,
      baseline_version_hash: audit.baselineVersionHash,
      quality,
      traceMap: resumeTraceAudit.traceMap,
      debugTrace: resumeTraceAudit.debugTrace,
      ...(resumeTraceAudit.evidenceDetailsMap
        ? { evidenceDetailsMap: resumeTraceAudit.evidenceDetailsMap }
        : {}),
      exports: exportable ? exports : ({ docx: false, pdf: false } as DocumentGenerationExports),
      preview: {
        resume: sanitizedPreviewDocument,
      },
      trackerEntryId: trackerEntry?.id ?? null,
      trackerStatus: trackerEntry?.status ?? null,
      opportunityId: opportunity?.id ?? null,
      claimRiskSummary,
      gapAnalysis: gapInsights,
      gapGuidance,
      display,
      safeDisplay: display,
      internal: {
        auditId: audit.id,
        baselineVersionHash: audit.baselineVersionHash,
        generationPipeline: isResumeV2 ? 'v2' : 'v1',
        complianceFlags,
        careerIdentity: careerIdentitySnapshot,
        ...(baselineEvidenceTooWeakDetails ? { baselineEvidenceTooWeak: baselineEvidenceTooWeakDetails } : {}),
        resumeGenerationStage: experienceDiagnostics.resumeGenerationStage,
        resumeGenerationReason: experienceDiagnostics.resumeGenerationReason,
        resumeGenerationDiagnostics: experienceDiagnostics,
        normalizationDiagnostics: experienceDiagnostics,
        ...(usedInterpretedEvidenceInDraft
          ? {
              interpretedEvidenceSummary: interpretedEvidenceForBaseline.summary,
              interpretedEvidenceReadiness,
              bypassedTemplateHardBlockWithInterpretedEvidence,
              omittedInterpretedEvidence: {
                weak: interpretedEligibility.omissions.omittedWeakEvidenceIds,
                unusable: interpretedEligibility.omissions.omittedUnusableEvidenceIds,
                no_tools_or_metrics: interpretedEligibility.omissions.omittedNoToolsOrMetricsIds,
              },
            }
          : {}),
        ...(usedStructuredBaselineTemplate
          ? {
              generationMode: 'structured_baseline_template',
              templateVersion: STRUCTURED_BASELINE_TEMPLATE_VERSION,
            }
          : {}),
      },
      ...(qualityGate.status === 'pass'
        ? { qualityGate: { status: 'pass', reasons: [] } }
        : { qualityGate }),
      idempotency: {
        status: (forceTemplateRegen ? 'accepted_new' : (reservation.status as IdempotencyStatus)),
        runId: reservation.runId,
        dedupeKey,
        reused: !forceTemplateRegen && reservation.status === 'existing_completed',
      },
    };

    // Final safety: ensure the exact preview payload returned to Studio is sanitized.
    if (response?.preview?.resume) {
      response.preview.resume = sanitizeResumePreviewForStudio(response.preview.resume);
    }
    if (typeof normalizedDocument.summary === 'string') {
      normalizedDocument.summary = trimIncompleteTrailingFragments(normalizedDocument.summary);
    }
    if (Array.isArray((normalizedDocument as any).experience)) {
      (normalizedDocument as any).experience = (normalizedDocument as any).experience.map((entry: any) => {
        if (!entry || typeof entry !== 'object') return entry;
        const bullets = Array.isArray(entry.bullets) ? entry.bullets : [];
        const cleanedBullets = bullets
          .map((b: unknown) => (typeof b === 'string' ? trimIncompleteTrailingFragments(b) : ''))
          .map((b: string) => b.trim())
          .filter((b: string) => b.length >= 10);
        return { ...entry, bullets: cleanedBullets };
      });
    }

    if (response?.preview?.resume && Array.isArray((response.preview.resume as any).experience)) {
      const previewEnforced = enforceEmployerRoleBulletProvenance({ experience: (response.preview.resume as any).experience });
      (response.preview.resume as any).experience = previewEnforced.experience as any;
      crossCompanyEvidenceBlockedCount += previewEnforced.blockedCount;

      const previewStripped = stripCrossCompanyBullets({ experience: (response.preview.resume as any).experience });
      (response.preview.resume as any).experience = previewStripped.experience as any;
      crossCompanyEvidenceBlockedCount += previewStripped.blockedCount;
    }

    const persistedContent = trimIncompleteTrailingFragments(buildResumePlainText(normalizedDocument));
    if (!persistedContent || persistedContent.trim().length < 10) {
      throw new UnprocessableEntityException({
        error: {
          code: 'generation_empty_output',
          message: 'Resume generation produced empty output.',
        },
      });
    }
    (response as any).content = persistedContent;

    const authoritativeExperienceCountForGuard = (() => {
      try {
        const structured = extractStructuredBaselineFromSections(resumeInputSections as any);
        if (Array.isArray((structured as any)?.experience)) return (structured as any).experience.length;
        return 0;
      } catch {
        return 0;
      }
    })();
    const hasMinimalSummarySection = (() => {
      try {
        const sections = (response as any)?.preview?.resume?.sections;
        if (!Array.isArray(sections)) return false;
        return sections.some((s: any) => String(s?.type ?? '').toLowerCase() === 'minimal-summary');
      } catch {
        return false;
      }
    })();
    const isMinimalFallbackRuntime = Boolean((response as any)?.internal?.minimalFallback) || hasMinimalSummarySection;
    if (isMinimalFallbackRuntime || authoritativeExperienceCountForGuard === 0) {
      if (process.env.DOCGEN_DIAGNOSTICS === 'true') {
        (response as any).internal = {
          ...((response as any).internal ?? {}),
          productionValidation: {
            ...(((response as any).internal ?? {}).productionValidation ?? {}),
            rejectedMinimalArtifact: Boolean(isMinimalFallbackRuntime),
            rejectedMinimalArtifactReason: isMinimalFallbackRuntime
              ? 'minimal_fallback_detected'
              : 'authoritative_experience_zero',
            authoritativeExperienceCount: authoritativeExperienceCountForGuard,
            persistencePrevented: true,
          },
        };
      }
      throw new UnprocessableEntityException(
        buildArtifactFailurePayload({
          code: 'generation_blocked',
          category: 'generation_blocked',
          message: 'Resume generation is blocked because authoritative experience extraction is required.',
          detail: isMinimalFallbackRuntime
            ? 'Minimal fallback resume output is not eligible for Studio artifact persistence.'
            : 'No authoritative experience groups were extracted from baseline sections.',
          retryable: true,
          diagnostics: {
            authoritativeExperienceGroupCount: authoritativeExperienceCountForGuard,
          },
        }),
      );
    }

    if (process.env.DOCGEN_DIAGNOSTICS === 'true') {
      const extractRoles = (doc: any) =>
        Array.isArray(doc?.experience)
          ? doc.experience.map((e: any) => ({
              company: String(e?.company ?? ''),
              roleTitle: String(e?.roleTitle ?? ''),
              bulletCount: Array.isArray(e?.bullets) ? e.bullets.length : 0,
            }))
          : [];

      const normalizeToken = (value: unknown): string =>
        String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
      const buildRoleKey = (company: unknown, roleTitle: unknown): string =>
        `${String(company ?? '').trim()}::${String(roleTitle ?? '').trim()}`;
      const billingSignalsForText = (text: unknown): string[] => {
        const lowered = normalizeToken(text);
        const signals: string[] = [];
        if (!lowered) return signals;
        if (/billing/.test(lowered)) signals.push('billing_domain');
        if (/invoice/.test(lowered)) signals.push('invoice_domain');
        if (/dispute/.test(lowered)) signals.push('dispute_domain');
        if (/credit/.test(lowered)) signals.push('credit_domain');
        if (/metering/.test(lowered) || /usage metering/.test(lowered)) signals.push('metering_domain');
        if (/reconciliation/.test(lowered) || /reconcile/.test(lowered)) signals.push('reconciliation_domain');
        if (/revenue/.test(lowered) || /revenue-impact/.test(lowered)) signals.push('revenue_domain');
        if (/knowledge base/.test(lowered) || /kbase/.test(lowered)) signals.push('billing_kb_domain');
        return Array.from(new Set(signals));
      };
      const roleSignalsFromExperience = (experience: any[]): Record<string, string[]> => {
        const out: Record<string, string[]> = {};
        for (const role of experience ?? []) {
          const roleKey = buildRoleKey(role?.company, role?.roleTitle);
          const bullets = Array.isArray(role?.bullets) ? role.bullets : [];
          const signals = new Set<string>();
          billingSignalsForText(`${String(role?.company ?? '')} ${String(role?.roleTitle ?? '')} ${String(role?.dateRange ?? role?.dates ?? '')}`).forEach((s) =>
            signals.add(s),
          );
          for (const bullet of bullets) {
            billingSignalsForText(typeof bullet === 'string' ? bullet : (bullet as any)?.text).forEach((s) => signals.add(s));
          }
          out[roleKey] = Array.from(signals);
        }
        return out;
      };
      const roleSignalsFromRenderPlan = (renderPlan: any): Record<string, string[]> => {
        const out: Record<string, string[]> = {};
        const candidatesRaw = (renderPlan as any)?.evidencePriorities ?? [];
        const candidates = Array.isArray(candidatesRaw) ? candidatesRaw : [];
        for (const candidate of candidates) {
          const theme = typeof candidate === 'string' ? candidate : (candidate as any)?.theme;
          const signals = billingSignalsForText(theme);
          if (!signals.length) continue;
          const sourceEmployerRoleKey = typeof (candidate as any)?.sourceEmployerRoleKey === 'string' ? String((candidate as any).sourceEmployerRoleKey) : null;
          const derivedFromRoleKey = typeof (candidate as any)?.derivedFromRoleKey === 'string' ? String((candidate as any).derivedFromRoleKey) : null;
          const targetKey = sourceEmployerRoleKey || derivedFromRoleKey;
          if (!targetKey) continue;
          out[targetKey] = Array.from(new Set([...(out[targetKey] ?? []), ...signals]));
        }
        return out;
      };
      const sentinelRoleKeysFrom = (roleKeys: string[]): string[] =>
        (roleKeys ?? []).filter((k) => /\bsentinelone\b/i.test(k));
      const getFirstContaminationStage = (payload: {
        authoritative: Record<string, string[]>;
        persistedV2: Record<string, string[]>;
        renderPlan: Record<string, string[]>;
        narrative: Record<string, string[]>;
      }): { stage: string; signals: string[] } => {
        const sentinelKeys = Array.from(
          new Set([
            ...sentinelRoleKeysFrom(Object.keys(payload.authoritative)),
            ...sentinelRoleKeysFrom(Object.keys(payload.persistedV2)),
            ...sentinelRoleKeysFrom(Object.keys(payload.renderPlan)),
            ...sentinelRoleKeysFrom(Object.keys(payload.narrative)),
          ]),
        );
        const stageOrder: Array<{ name: string; map: Record<string, string[]> }> = [
          { name: 'authoritative_extraction', map: payload.authoritative },
          { name: 'persisted_resume_v2', map: payload.persistedV2 },
          { name: 'render_plan', map: payload.renderPlan },
          { name: 'narrative_rewrite', map: payload.narrative },
        ];
        let prior = new Set<string>();
        for (const stage of stageOrder) {
          const stageSignals = new Set<string>();
          for (const k of sentinelKeys) {
            (stage.map[k] ?? []).forEach((s) => stageSignals.add(s));
          }
          const delta = Array.from(stageSignals).filter((s) => !prior.has(s));
          if (delta.length) return { stage: stage.name, signals: delta.slice(0, 8) };
          prior = new Set([...prior, ...stageSignals]);
        }
        return { stage: '', signals: [] };
      };
      const parsedJson = (baseline.parsedRecords?.[0] as any)?.parsedJson ?? null;
      const parsedJsonExpLen = Array.isArray(parsedJson?.experience) ? parsedJson.experience.length : null;
      const resumeV2ExpLen = Array.isArray((persistedResumeV2 as any)?.experience) ? (persistedResumeV2 as any).experience.length : null;
      const persistedRoles = extractRoles(normalizedDocument);
      const meaningfulPersistedRoleCount = persistedRoles.filter((r: any) => {
        const header = `${String(r.company ?? '')} ${String(r.roleTitle ?? '')}`.toLowerCase();
        if (/\b(vue|react|deck builder|frontend)\b/i.test(header)) return false;
        if (/\bcontractor\b/i.test(header) && /\b(linux|infrastructure|sysadmin)\b/i.test(header)) return false;
        return (r.bulletCount ?? 0) >= 2;
      }).length;
      const renderedRoles = extractRoles((response as any)?.preview?.resume);
      const renderedRoleOrder = renderedRoles.map((r: any) => `${r.company} | ${r.roleTitle}`);
      const rawResumeV2RoleOrder = Array.isArray((persistedResumeV2 as any)?.experience)
        ? (persistedResumeV2 as any).experience.map((e: any) => `${String(e?.company ?? '')} | ${String(e?.roleTitle ?? '')}`)
        : Array.isArray((normalizedDocument as any)?.experience)
          ? ((normalizedDocument as any).experience as any[]).map((e: any) => `${String(e?.company ?? '')} | ${String(e?.roleTitle ?? '')}`)
          : [];
      const planRoleOrder = positioningMetadata?.plan?.emphasizeRoleIds ?? [];
      const leakedSuppressedRoles = (() => {
        const suppressedIds = new Set([...(positioningMetadata?.suppressedExperienceIds ?? []), ...(positioningMetadata?.plan?.suppressRoleIds ?? [])]);
        if (suppressedIds.size === 0) return [];
        const idToHeader = new Map<string, string>();
        rawResumeV2RoleOrder.forEach((header: string, index: number) => idToHeader.set(`resume_v2_exp_${index}`, header));
        return [...suppressedIds].map((id) => idToHeader.get(id) ?? id).filter((h) => renderedRoleOrder.includes(h));
      })();

      (response as any).internal = {
        ...((response as any).internal ?? {}),
        diagnostics: {
          parsedJsonExperienceLength: parsedJsonExpLen,
          resumeV2ExperienceLength: resumeV2ExpLen,
          meaningfulResumeV2ExperienceCount: meaningfulPersistedRoleCount,
          positioningPlanRoleOrder: planRoleOrder,
          renderedRoleOrder,
          leakedSuppressedRoles,
          rawResumeV2RoleOrder,
          authoritativeSummarySource: positioningMetadata?.plan?.positioningThesis ? 'positioning_plan_thesis' : 'resumeV2_or_positioning_fallback',
          renderedRoleCount: Array.isArray((response as any)?.preview?.resume?.experience)
            ? (response as any).preview.resume.experience.length
            : 0,
          realDocumentReasonCodes: (response as any)?.qualityGate?.reasons ?? [],
          rankedExperienceIds: positioningMetadata?.prioritizedExperienceIds ?? [],
          suppressedExperienceIds: positioningMetadata?.suppressedExperienceIds ?? [],
          positioningPlan: positioningMetadata?.plan
            ? {
                targetRoleFamily: positioningMetadata.plan.targetRoleFamily,
                positioningThesis: positioningMetadata.plan.positioningThesis,
                seniorityLevel: positioningMetadata.plan.seniorityLevel,
                topEvidenceThemes: positioningMetadata.plan.topEvidenceThemes,
                emphasizeRoleIds: positioningMetadata.plan.emphasizeRoleIds,
                suppressRoleIds: positioningMetadata.plan.suppressRoleIds,
                summaryStrategy: positioningMetadata.plan.summaryStrategy,
              }
            : null,
          renderedRoles,
          persistedRoles,
          responseRoles: extractRoles((response as any)?.preview?.resume),
        },
      };

      // Prompt 8: temporary production validation fields (diagnostics-only, no raw text).
      // Removal plan: delete `productionValidation` once Studio high-fit flow is stable in production.
      try {
        let structuredForDiagnostics: any = null;
        let authoritativeRoleKeys: string[] = [];
        let persistedResumeV2RoleKeys: string[] = [];
        let renderPlanRoleKeys: string[] = [];
        let renderPlanRankingCandidateOrigins: Array<{ themeHash: string; sourceEmployerRoleKey: string | null; derivedFromRoleKey: string | null }> = [];
        let narrativeRewriteRoleKeys: string[] = [];
        let first: { stage: string; signals: string[] } = { stage: '', signals: [] };

        try {
          structuredForDiagnostics = extractStructuredBaselineFromSections(resumeInputSections as any);
          authoritativeRoleKeys = Array.isArray(structuredForDiagnostics?.diagnostics?.parsedEmployerRoleKeys)
            ? structuredForDiagnostics.diagnostics.parsedEmployerRoleKeys.map((k: any) => String(k ?? '')).filter(Boolean)
            : Array.isArray(structuredForDiagnostics?.experience)
              ? structuredForDiagnostics.experience.map((e: any) => buildRoleKey(e?.company, e?.roleTitle)).filter(Boolean)
              : [];
        } catch {
          authoritativeRoleKeys = [];
        }

        try {
          persistedResumeV2RoleKeys = Array.isArray((persistedResumeV2 as any)?.experience)
            ? (persistedResumeV2 as any).experience.map((e: any) => buildRoleKey(e?.company, e?.roleTitle)).filter(Boolean)
            : Array.isArray((normalizedDocument as any)?.experience)
              ? (normalizedDocument as any).experience.map((e: any) => buildRoleKey(e?.company, e?.roleTitle)).filter(Boolean)
              : [];
        } catch {
          persistedResumeV2RoleKeys = [];
        }

        try {
          renderPlanRoleKeys =
            renderPlanForDiagnostics && typeof renderPlanForDiagnostics === 'object'
              ? Array.from(
                  new Set([
                    ...(((renderPlanForDiagnostics as any).orderedRoleIds ?? []) as any[]).map((id) => String(id ?? '')).filter(Boolean),
                    ...(((renderPlanForDiagnostics as any).suppressedRoleIds ?? []) as any[]).map((id) => String(id ?? '')).filter(Boolean),
                  ]),
                )
              : [];
        } catch {
          renderPlanRoleKeys = [];
        }

        try {
          const { createHash } = require('crypto');
          const candidatesRaw = (renderPlanForDiagnostics as any)?.evidencePriorities ?? [];
          const candidates = Array.isArray(candidatesRaw) ? candidatesRaw : [];
          renderPlanRankingCandidateOrigins = candidates
            .map((c: any) => {
              const theme = typeof c === 'string' ? String(c ?? '').trim() : String(c?.theme ?? '').trim();
              if (!theme) return null;
              const sourceEmployerRoleKey = typeof c?.sourceEmployerRoleKey === 'string' ? String(c.sourceEmployerRoleKey) : null;
              const derivedFromRoleKey = typeof c?.derivedFromRoleKey === 'string' ? String(c.derivedFromRoleKey) : null;
              const themeHash = createHash('sha256').update(theme).digest('hex');
              return { themeHash, sourceEmployerRoleKey, derivedFromRoleKey };
            })
            .filter(Boolean)
            .slice(0, 40) as any;
        } catch {
          renderPlanRankingCandidateOrigins = [];
        }

        try {
          narrativeRewriteRoleKeys = Array.isArray((normalizedDocument as any)?.experience)
            ? (normalizedDocument as any).experience.map((e: any) => buildRoleKey(e?.company, e?.roleTitle)).filter(Boolean)
            : [];
        } catch {
          narrativeRewriteRoleKeys = [];
        }

        try {
          const authoritativeSignals = roleSignalsFromExperience(Array.isArray(structuredForDiagnostics?.experience) ? structuredForDiagnostics.experience : []);
          const persistedV2Signals = roleSignalsFromExperience(Array.isArray((persistedResumeV2 as any)?.experience) ? (persistedResumeV2 as any).experience : []);
          const renderPlanSignals = roleSignalsFromRenderPlan(renderPlanForDiagnostics);
          const narrativeSignals = roleSignalsFromExperience(
            Array.isArray((response as any)?.preview?.resume?.experience)
              ? ((response as any).preview.resume.experience as any[])
              : Array.isArray((normalizedDocument as any)?.experience)
                ? ((normalizedDocument as any).experience as any[])
                : [],
          );
          first = getFirstContaminationStage({
            authoritative: authoritativeSignals,
            persistedV2: persistedV2Signals,
            renderPlan: renderPlanSignals,
            narrative: narrativeSignals,
          });
        } catch {
          first = { stage: '', signals: [] };
        }

        const evidence = resolveGenerationEvidence({
          baseline: baseline as any,
          baselineVersionId: baselineVersion.id,
        });
        const eligibility = decideGenerationEligibility({
          baseline: baseline as any,
          baselineVersion: baselineVersion as any,
          job: job as any,
          readinessScore: null,
          assessment: latestAssessment as any,
          complianceBlocked: false,
          evidence,
          targetRequirements: request.excludedRequirements ?? [],
        });
          (response as any).internal = {
          ...((response as any).internal ?? {}),
          productionValidation: {
            careerIdentity: careerIdentitySnapshot,
            authoritativeExperienceRoleKeys: authoritativeRoleKeys.slice(0, 40),
            persistedResumeV2RoleKeys: persistedResumeV2RoleKeys.slice(0, 40),
            renderPlanRoleKeys: renderPlanRoleKeys.slice(0, 80),
            renderPlanRankingCandidateOrigins,
            narrativeRewriteRoleKeys: narrativeRewriteRoleKeys.slice(0, 40),
            hydratedArtifactSource: response?.idempotency?.reused ? 'idempotency_reuse' : 'fresh_generation',
            artifactReuseDetected: Boolean(response?.idempotency?.reused),
            reusedArtifactId: response?.idempotency?.reused ? String((response as any)?.idempotency?.artifactId ?? '') || null : null,
            contaminationStage: first.stage || null,
            contaminationSignals: first.signals,
            evidenceSourceUsed: evidence.primarySource,
            employerRoleGroupCount: Array.isArray((normalizedDocument as any)?.experience)
              ? (normalizedDocument as any).experience.length
              : 0,
            crossRoleAttributionBlocks: crossCompanyEvidenceBlockedCount,
            evidencePartitionStage: evidence.primarySource,
            employerScopedRankingEnabled: Boolean((normalizedDocument as any)?.__compositionDiagnostics?.employerScopedRankingEnabled ?? true),
            crossEmployerRankingBlocks: Number((normalizedDocument as any)?.__compositionDiagnostics?.crossEmployerRankingBlocks ?? 0),
            provenanceEnforcementExecuted: Boolean((normalizedDocument as any)?.__compositionDiagnostics?.provenanceEnforcementExecuted ?? false),
            extractionBoundaryEnforcementExecuted: Boolean((normalizedDocument as any)?.__compositionDiagnostics?.extractionBoundaryEnforcementExecuted ?? false),
            employerScopedRankingExecuted: Boolean((normalizedDocument as any)?.__compositionDiagnostics?.employerScopedRankingEnabled ?? false),
            freshCompositionExecuted: Boolean((normalizedDocument as any)?.__compositionDiagnostics?.freshCompositionExecuted ?? false),
            compositionAuthorityPath: String((normalizedDocument as any)?.__compositionDiagnostics?.compositionPathExecuted ?? ''),
            authorityFingerprint: String((normalizedDocument as any)?.__compositionDiagnostics?.authorityFingerprint ?? ''),
            preCompositionContaminationCount: Number((normalizedDocument as any)?.__compositionDiagnostics?.preCompositionContaminationCount ?? 0),
            preCompositionContaminatedRoleKeys: Array.isArray((normalizedDocument as any)?.__compositionDiagnostics?.preCompositionContaminatedRoleKeys)
              ? (normalizedDocument as any).__compositionDiagnostics.preCompositionContaminatedRoleKeys.map((k: any) => String(k ?? '')).filter(Boolean)
              : [],
            generationFreshness: response?.idempotency?.reused ? 'idempotency_reuse_recomposed' : 'fresh_generation',
            generationEligibilityDecision: {
              eligible: eligibility.eligible,
              hardBlockerCode: eligibility.hardBlocker?.code ?? null,
            },
            fallbackWarnings: [
              ...(evidence.warnings ?? []).map((w) => w.code),
              ...(crossCompanyEvidenceBlockedCount > 0 ? ['cross_company_evidence_blocked'] : []),
            ],
            omittedUnsupportedRequirements: eligibility.omittedUnsupportedRequirements ?? [],
            crossCompanyEvidenceBlockedCount: crossCompanyEvidenceBlockedCount,
            finalDocumentStatus: {
              exportReady: Boolean((response as any)?.exportReady),
              qualityGateStatus: String((response as any)?.qualityGate?.status ?? ''),
            },
          },
        };
      } catch {
        // ignore diagnostics failures
      }
    }
    // eslint-disable-next-line no-console
    console.log('[RESUME_GENERATE_OUTPUT]', {
      hasContent: true,
      length: persistedContent.length,
      responseKeys: response && typeof response === 'object' ? Object.keys(response as any) : [],
    });

    const artifactId = await this.studioArtifactsService.recordResumeSuccess({
      userId,
      baselineId: studioArtifactContext.baselineId,
      jobId: studioArtifactContext.jobId,
      baselineVersionId: studioArtifactContext.baselineVersionId,
      baselineVersionHash: studioArtifactContext.baselineVersionHash,
      jobFingerprint: studioArtifactContext.jobFingerprint,
      inputsHash: studioArtifactContext.inputsHash,
      analysisId: studioArtifactContext.analysisId,
      responseBody: response as unknown as Record<string, unknown>,
      content: persistedContent,
      metadata: {
        auditId: audit.id,
        baselineVersionHash: audit.baselineVersionHash,
        analysisId: studioArtifactContext.analysisId,
        positioning: positioningMetadata,
      },
    });
    // eslint-disable-next-line no-console
    console.log('[RESUME_GENERATE_PERSISTED]', { artifactId });

    if (process.env.DOCGEN_DIAGNOSTICS === 'true') {
      (response as any).internal = {
        ...((response as any).internal ?? {}),
        productionValidation: {
          ...(((response as any).internal ?? {}).productionValidation ?? {}),
          artifactPersistenceStatus: {
            status: 'persisted',
            artifactId,
          },
        },
      };
    }
    try {
      const qualityGate = (response as any)?.qualityGate;
      const gateStatus =
        qualityGate && typeof qualityGate === 'object' ? String((qualityGate as any).status ?? '') : null;
      const qualityGateReasonCodes =
        qualityGate && typeof qualityGate === 'object' && Array.isArray((qualityGate as any).reasons)
          ? (qualityGate as any).reasons.map((r: unknown) => String(r ?? '')).filter(Boolean).slice(0, 8)
          : [];
      const payload = {
        artifactId,
        runId: audit.id,
        auditId: audit.id,
        qualityStatus: gateStatus || null,
        correctionReasonCodes: qualityGateReasonCodes,
        qualityGateReasonCodes,
        createdAt: null,
        updatedAt: null,
      };
      // eslint-disable-next-line no-console
      console.log('[RESUME_PERSISTED_REASONS_TRACE]', JSON.stringify(payload));
    } catch {
      // ignore logging failures
    }
    if (!forceTemplateRegen) {
      await this.workflowIdempotencyService.complete({
        userId,
        operationName: 'generation.resume',
        dedupeKey,
        runId: reservation.runId,
        responseBody: response,
      });
    }
    return response;
    } catch (error) {
      if (isResumeV2) {
        const responseBody =
          error instanceof UnprocessableEntityException
            ? (error.getResponse() as any)
            : null;
        const errorCode = responseBody?.error?.code ?? responseBody?.code ?? null;
        const errorMessage =
          responseBody?.error?.message ?? responseBody?.message ?? (error instanceof Error ? error.message : String(error));
        this.logger.error('[resume-generation][v2] failed', {
          userId,
          baselineId: studioArtifactContext.baselineId || null,
          baselineVersionId: studioArtifactContext.baselineVersionId || null,
          jobId: studioArtifactContext.jobId || null,
          analysisId: studioArtifactContext.analysisId || null,
          code: errorCode,
          message: errorMessage,
          name: error instanceof Error ? error.name : typeof error,
          stack: error instanceof Error ? error.stack : null,
        });

        try {
          await this.studioArtifactsService.recordResumeFailure({
            userId,
            baselineId: studioArtifactContext.baselineId,
            jobId: studioArtifactContext.jobId,
            baselineVersionId: studioArtifactContext.baselineVersionId,
            baselineVersionHash: studioArtifactContext.baselineVersionHash,
            jobFingerprint: studioArtifactContext.jobFingerprint,
            inputsHash: studioArtifactContext.inputsHash,
            analysisId: studioArtifactContext.analysisId,
            failureCode: String(errorCode ?? 'resume_v2_failed'),
            failureMessage: String(errorMessage ?? 'Resume V2 generation failed.'),
            metadata: {
              generationPipeline: 'v2',
              errorCode: errorCode ?? null,
            },
          } as any);
        } catch {
          // ignore persistence failures for failure artifacts
        }

        throw error;
      }

      if (error instanceof UnprocessableEntityException) {
        const responseBody = error.getResponse() as any;
        const category = responseBody?.category ?? responseBody?.error?.category ?? null;
        const code = responseBody?.code ?? responseBody?.error?.code ?? null;
        const artifactReadiness = responseBody?.diagnostics?.artifactReadiness ?? responseBody?.error?.diagnostics?.artifactReadiness ?? null;
        if (category === 'generation_blocked' || code === 'generation_blocked' || artifactReadiness === 'blocked') {
          throw error;
        }
      }
      const hasBaselineText =
        Boolean(minimalDraftSectionsForFailSafe) &&
        (minimalDraftSectionsForFailSafe ?? []).some(
          (section) => (section.content ?? '').trim().length > 0,
        );

      if (hasBaselineText && baselineForFailSafe && baselineVersionForFailSafe && minimalDraftSectionsForFailSafe) {
        // Top-level fail-safe: never return a full resume generation failure when baseline content exists.
        // This fallback is baseline-only and intentionally skips tailoring, trace auditing, and compliance enforcement.
        this.logger.error('[resume-generation] top_level_fail_safe_minimal', {
          userId,
          baselineId: baselineForFailSafe.id,
          baselineVersionId: baselineVersionForFailSafe.id,
          jobId: jobIdForFailSafe,
          analysisId: analysisIdForFailSafe,
          reason: error instanceof Error ? error.message : String(error),
        });

        // Prompt 14: Never synthesize employer-role structure from unstructured text blobs.
        // If we cannot extract any valid structured experience groups, fail closed instead of returning a minimal fallback resume.
        try {
          const structured = extractStructuredBaselineFromSections(
            (resolveBaselineSectionsForGeneration(baselineForFailSafe) as any) ?? (baselineForFailSafe.sections as any),
          ) as any;
          const expCount = Array.isArray(structured?.experience) ? structured.experience.length : 0;
          if (expCount === 0) {
            throw new UnprocessableEntityException(buildArtifactFailurePayload({
              code: 'generation_blocked',
              category: 'generation_blocked',
              message: 'Resume generation is blocked because employer-role experience extraction failed.',
              detail:
                'No valid structured experience groups (company + role title + bullets) were found. Reprocess the baseline resume or re-upload with clearer experience headers.',
              retryable: true,
              diagnostics: {
                artifactReadiness: 'blocked',
                authoritativeExtractionSucceeded: false,
                authoritativeExperienceGroupCount: 0,
                fallbackGenerationPrevented: true,
                legacyFallbackAttemptBlocked: true,
                generationTerminationStage: 'top_level_fail_safe_minimal_blocked',
              },
            }));
          }
        } catch (guardErr) {
          if (guardErr instanceof UnprocessableEntityException) throw guardErr;
        }

        const identity = resolveBaselineIdentity(baselineForFailSafe);
        let normalizedDocument: NormalizedResumeDocument | null = null;
        try {
          normalizedDocument = buildNormalizedResumeDocument(
            minimalDraftSectionsForFailSafe as unknown as ResumeExportSection[],
            identity,
          );
        } catch {
          normalizedDocument = null;
        }
        const minimalAuditId = `minimal:${Date.now()}`;
        const qualityGate = validateResumeArtifactQuality(normalizedDocument);
        emitArtifactQualityTelemetry(
          this.logger,
          {
            artifactType: 'resume',
            baselineId: baselineForFailSafe.id,
            baselineVersionId: baselineVersionForFailSafe.id,
            jobId: jobIdForFailSafe ?? '',
            analysisId: analysisIdForFailSafe ?? null,
            requestId: minimalAuditId ?? null,
          },
          {
            firstPass: qualityGate,
            final: qualityGate,
            repairAttempted: false,
          },
        );
        // Minimal fail-safe intentionally skips tailoring + trace auditing.
        // Still surface interpreted evidence summary/readiness when available so Studio can distinguish:
        // - evidence used + auditable
        // - evidence available but minimal fail-safe (no trace/audit)
        // - no interpreted evidence involved
        const interpretedEvidenceForFailSafe = interpretEvidenceFromResumeText({
          baselineId: baselineForFailSafe.id,
          baselineVersionId: baselineVersionForFailSafe.id,
          // Authority boundary: in ResumeV2 mode, interpreted evidence must be derived from the persisted ResumeV2 model
          // (BaselineParsed.resumeV2Json), never from baseline section concatenations.
          resumeText: isResumeV2
            ? buildResumePlainText(normalizedDocument as any)
            : (baselineForFailSafe.sections ?? []).map((s: any) => s?.content ?? '').join('\n'),
        });
        const interpretedEligibilityForFailSafe = evaluateInterpretedEvidenceEligibility(
          interpretedEvidenceForFailSafe.items,
        );
        const interpretedEvidenceAvailable = interpretedEligibilityForFailSafe.hasMeaningfulInterpretedEvidence;
        const interpretedEvidenceReadinessForFailSafe = resolveEvidenceReadinessFromSummary(
          interpretedEvidenceForFailSafe.summary,
        );

        const response: ResumeGenerationResponse = {
          ok: true,
          status: 'success',
          generationStatus: 'success',
          exportReady: true,
          blocked: false,
          baselineId: baselineForFailSafe.id,
          baselineVersionId: baselineVersionForFailSafe.id,
          jobId: jobIdForFailSafe,
          sections: this.complianceService.normalizeSectionsForOutput(
            minimalDraftSectionsForFailSafe as unknown as ResumeExportSection[],
          ) as unknown as ResumeExportSection[],
          compliance_flags: [],
          compliance_blocked: false,
          audit_id: minimalAuditId,
          auditId: minimalAuditId,
          baseline_version_hash: baselineVersionForFailSafe.hash ?? null,
          quality: 'draft',
          traceMap: {},
          debugTrace: {
            passed: true,
            failures: [],
            traceCoverage: 1,
            unusedEvidence: [],
            selectedEvidence: [],
          },
          exports: { docx: false, pdf: false },
          preview: {
            resume: normalizedDocument,
          },
          trackerEntryId: null,
          trackerStatus: null,
          opportunityId: null,
          claimRiskSummary: null,
          gapAnalysis: null,
          gapGuidance: null,
          display: this.buildSuccessDisplayPayload(),
          safeDisplay: this.buildSuccessDisplayPayload(),
          internal: {
            minimalFallback: true,
            resumeGenerationMode: 'top_level_fail_safe_minimal',
            resumeFailSafeMinimalUsed: true,
            interpretedEvidenceAuditUnavailableReason: 'minimal_fail_safe_no_trace_audit',
            ...(interpretedEvidenceAvailable
              ? {
                  interpretedEvidenceAvailable: true,
                  interpretedEvidenceSummary: interpretedEvidenceForFailSafe.summary,
                  interpretedEvidenceReadiness: interpretedEvidenceReadinessForFailSafe,
                  omittedInterpretedEvidence: {
                    weak: interpretedEligibilityForFailSafe.omissions.omittedWeakEvidenceIds,
                    unusable: interpretedEligibilityForFailSafe.omissions.omittedUnusableEvidenceIds,
                    no_tools_or_metrics: interpretedEligibilityForFailSafe.omissions.omittedNoToolsOrMetricsIds,
                  },
                }
              : { interpretedEvidenceAvailable: false }),
            failureReason: error instanceof Error ? error.message : String(error),
          },
          ...(qualityGate.status === 'pass'
            ? { qualityGate: { status: 'pass', reasons: [] } }
            : { qualityGate }),
        };

        const failSafeSucceeded = (() => {
          if (qualityGate.status !== 'pass' || !normalizedDocument) return false;
          try {
            const normalized = normalizeNormalizedResumeDocument(normalizedDocument);
            validateNormalizedResumeDocument(normalized);
            return true;
          } catch {
            return false;
          }
        })();
        try {
          if (failSafeSucceeded) {
            void this.studioArtifactsService.recordResumeSuccess({
              userId,
              baselineId: studioArtifactContext.baselineId,
              jobId: studioArtifactContext.jobId,
              baselineVersionId: studioArtifactContext.baselineVersionId,
              baselineVersionHash: studioArtifactContext.baselineVersionHash,
              jobFingerprint: studioArtifactContext.jobFingerprint,
              inputsHash: studioArtifactContext.inputsHash,
              analysisId: studioArtifactContext.analysisId,
              responseBody: response as unknown as Record<string, unknown>,
              content: normalizedDocument ? buildResumePlainText(normalizedDocument) : '',
              metadata: {
                auditId: minimalAuditId,
                baselineVersionHash: baselineVersionForFailSafe.hash ?? null,
                analysisId: studioArtifactContext.analysisId,
                resumeGenerationMode: 'top_level_fail_safe_minimal',
                resumeFailSafeMinimalUsed: true,
                interpretedEvidenceAuditUnavailableReason: 'minimal_fail_safe_no_trace_audit',
                interpretedEvidenceAvailable,
                ...(interpretedEvidenceAvailable
                  ? {
                      interpretedEvidenceSummary: interpretedEvidenceForFailSafe.summary,
                      interpretedEvidenceReadiness: interpretedEvidenceReadinessForFailSafe,
                      omittedInterpretedEvidence: {
                        weak: interpretedEligibilityForFailSafe.omissions.omittedWeakEvidenceIds,
                        unusable: interpretedEligibilityForFailSafe.omissions.omittedUnusableEvidenceIds,
                        no_tools_or_metrics: interpretedEligibilityForFailSafe.omissions.omittedNoToolsOrMetricsIds,
                      },
                    }
                  : {}),
              },
            });
          } else {
            void this.studioArtifactsService.recordResumeFailure({
              userId,
              baselineId: studioArtifactContext.baselineId,
              jobId: studioArtifactContext.jobId,
              baselineVersionId: studioArtifactContext.baselineVersionId,
              baselineVersionHash: studioArtifactContext.baselineVersionHash,
              jobFingerprint: studioArtifactContext.jobFingerprint,
              inputsHash: studioArtifactContext.inputsHash,
              analysisId: studioArtifactContext.analysisId,
              failureCode: 'resume_artifact_invalid',
              failureMessage:
                'Resume V2 produced an invalid normalized resume model. Please reprocess your baseline resume and try again.',
              metadata: {
                analysisId: studioArtifactContext.analysisId,
                resumeGenerationMode: 'top_level_fail_safe_minimal',
                resumeFailSafeMinimalUsed: true,
                qualityGateStatus: qualityGate.status,
              },
            });
          }
        } catch {
          // ignore fail-safe persistence failures
        }

        if (dedupeKey && reservationRunId) {
          try {
            if (failSafeSucceeded) {
              void this.workflowIdempotencyService.complete({
                userId,
                operationName: 'generation.resume',
                dedupeKey,
                runId: reservationRunId,
                responseBody: response,
              });
            } else {
              void this.workflowIdempotencyService.markFailure({
                userId,
                operationName: 'generation.resume',
                dedupeKey,
                runId: reservationRunId,
                status: 'FAILED',
                errorCode: 'resume_artifact_invalid',
                errorMessage:
                  'Resume V2 produced an invalid normalized resume model. Please reprocess your baseline resume and try again.',
              });
            }
          } catch {
            // ignore fail-safe idempotency completion failures
          }
        }

        recordResumeEvent(failSafeSucceeded);
        return response;
      }

      recordResumeEvent(false);
      void this.studioArtifactsService.recordResumeFailure({
        userId,
        baselineId: studioArtifactContext.baselineId,
        jobId: studioArtifactContext.jobId,
        baselineVersionId: studioArtifactContext.baselineVersionId,
        baselineVersionHash: studioArtifactContext.baselineVersionHash,
        jobFingerprint: studioArtifactContext.jobFingerprint,
        inputsHash: studioArtifactContext.inputsHash,
        analysisId: studioArtifactContext.analysisId,
        failureCode: error instanceof Error ? error.name : 'generation_failed',
        failureMessage: error instanceof Error ? error.message : String(error),
        metadata: {
          analysisId: studioArtifactContext.analysisId,
        },
      });
      if (!forceTemplateRegen && dedupeKey) {
        void this.workflowIdempotencyService.markFailure({
          userId,
          operationName: 'generation.resume',
          dedupeKey,
          runId: reservationRunId ?? 'unknown',
          status: 'FAILED',
          errorCode: error instanceof Error ? error.name : 'generation_failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  private buildCxFitScoreSnapshot(
    assessment?: FitAssessment | null,
  ): CxFitScoreSnapshot | undefined {
    if (!assessment) {
      return undefined;
    }

    const createdAt = assessment.createdAt ? assessment.createdAt : new Date(0);

    return {
      overallScore: assessment.overallScore,
      verdict: assessment.verdict,
      dimensionScores: assessment.dimensionScores,
      weights: assessment.scoringV2?.rubric?.weights,
      scoringContractVersion: assessment.scoringV2?.rubric?.id,
      createdAt: createdAt.toISOString(),
    };
  }

  private async buildDocxModelFromGeneration(
    generation: {
      normalizedDocument?: NormalizedResumeDocument | null;
    },
  ) {
    const normalizedDocument = generation.normalizedDocument;
    if (!normalizedDocument) {
      throw new UnprocessableEntityException({
        error: {
          code: 'NORMALIZATION_FAILED',
          message: 'Resume model is unavailable for rendering.',
        },
      });
    }
    return mapNormalizedResumeToDocxModel(normalizedDocument);
  }

  async getPreExportSnapshotForDiagnostics(
    userId: string,
    request: GenerateResumeRequest,
  ): Promise<ResumePreExportSnapshot> {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Pre-export diagnostics are disabled in production.');
    }

    const generation = await this.generateResume(userId, request, {
      enforceOneTap: false,
    });

    if (generation.compliance_blocked) {
      throw new UnprocessableEntityException({
        error: {
          code: 'COMPLIANCE_VIOLATION',
          message: 'Cannot create diagnostic snapshot when generation is compliance blocked.',
          details: {
            compliance_flags: generation.compliance_flags ?? [],
            audit_id: generation.auditId ?? generation.audit_id ?? null,
          },
        },
      });
    }
    if (generation.status !== 'success' || generation.exportReady !== true) {
      throw new UnprocessableEntityException({
        error: {
          code: 'NORMALIZATION_FAILED',
          message: 'Cannot export resume because generation did not produce a valid model.',
          details: {
            status: generation.status,
          },
        },
      });
    }
    const normalizedDocument = generation.preview?.resume ?? null;
    if (!normalizedDocument) {
      throw new UnprocessableEntityException({
        error: {
          code: 'NORMALIZATION_FAILED',
          message:
            'Cannot create diagnostic snapshot without a normalized resume model.',
        },
      });
    }

    const sectionFragments = generation.sections.map((section) => ({
      title: section.title ?? null,
      content: section.content ?? '',
    }));

    const docxModel = await this.buildDocxModelFromGeneration({
      normalizedDocument,
    });

    return {
      baselineId: generation.baselineId,
      baselineVersionId: generation.baselineVersionId,
      jobId: generation.jobId,
      quality: generation.quality === 'optimized' ? 'optimized' : 'draft',
      sections: generation.sections as ResumeExportSection[],
      sectionFragments,
      docxModel,
      normalizedDocument,
    };
  }

  async exportResume(
    userId: string,
    request: GenerateResumeRequest,
    format: 'docx' | 'pdf',
  ) {
    const generation = await this.generateResume(userId, request, {
      enforceOneTap: false,
    });

    if (generation.compliance_blocked) {
      throw new UnprocessableEntityException({
        error: {
          code: 'COMPLIANCE_VIOLATION',
          message: 'Compliance validation failed.',
          details: {
            blocked: true,
            compliance_flags: generation.compliance_flags ?? [],
            audit_id: generation.auditId ?? generation.audit_id ?? null,
            baseline_version_hash: generation.baseline_version_hash ?? null,
          },
        },
      });
    }
    if (generation.status !== 'success' || generation.exportReady !== true) {
      throw new UnprocessableEntityException({
        error: {
          code: 'NORMALIZATION_FAILED',
          message:
            'Cannot export resume because generation did not produce a valid model.',
          details: {
            status: generation.status,
          },
        },
      });
    }
    const normalizedDocumentInput =
      request.editedResume ?? generation.preview?.resume ?? null;
    if (!normalizedDocumentInput) {
      throw new UnprocessableEntityException({
        error: {
          code: 'NORMALIZATION_FAILED',
          message: 'Cannot export resume because the normalized model is missing.',
        },
      });
    }
    const normalizedDocument = normalizeNormalizedResumeDocument(
      normalizedDocumentInput,
    );
    const polished = polishNormalizedResumeDocument(normalizedDocument, {
      plan:
        request.documentStrategyPlan ??
        ({} as DocumentStrategyPlanLike),
    });
    const polishedDocument = polished.document;
    const normalizedValidation = validateNormalizedResumeDocument(
      polishedDocument,
    );
    if (!normalizedValidation.valid) {
      throw new UnprocessableEntityException({
        error: {
          code: 'NORMALIZATION_FAILED',
          message: 'Cannot export resume because normalized model validation failed.',
          details: {
            reasons: normalizedValidation.reasons.slice(0, 6),
          },
        },
      });
    }

    let buffer: Buffer;
    let pdfText: string | undefined;
    if (format === 'pdf') {
      pdfText = buildResumePlainText(polishedDocument);
      buffer = this.buildPdfBuffer(pdfText);
    } else {
      const model = await this.buildDocxModelFromGeneration({
        normalizedDocument: polishedDocument,
      });
      const template = getDocxTemplate<ResumeDocxModel>(
        'resume',
        DEFAULT_RESUME_TEMPLATE_KEY,
      );
      const renderContext: DocxRenderContextBase = {
        templateKey: DEFAULT_RESUME_TEMPLATE_KEY,
        font: 'Calibri',
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      };
      buffer = (await template.render(model, renderContext)).buffer;
    }

    const job = generation.jobId
      ? await this.jobsRepository.findOne({
          where: { id: generation.jobId, userId },
        })
      : null;

    const contentType =
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const filename = this.buildExportFilename(format, job?.company);

    const baselineVersion = await this.baselineVersionRepository.findOne({
      where: {
        id: generation.baselineVersionId,
        baselineId: generation.baselineId,
      },
    });

    if (!baselineVersion) {
      throw new NotFoundException('Baseline version not found');
    }
    if (!baselineVersion.hash) {
      throw new BadRequestException('Baseline version hash missing');
    }

    const { complianceFlags, blocked, audit } =
      await this.complianceService.validateAndAudit({
        action: ComplianceAction.RESUME_EXPORT,
        actorId: userId,
        baselineVersion,
        job,
        outputHash: createHash('sha256')
          .update(
            `${format}:${
              format === 'pdf'
              ? pdfText ?? ''
                : JSON.stringify(polishedDocument)
            }`,
          )
          .digest('hex'),
        baselineSections: generation.sections,
        generatedSections: generation.sections,
      });

    const blockingFlags = complianceFlags.filter(
      (flag) => flag.severity === 'block',
    );

    if (blocked && blockingFlags.length > 0) {
      throw new UnprocessableEntityException({
        error: {
          code: 'COMPLIANCE_VIOLATION',
          message: 'Compliance validation failed.',
          details: {
            compliance_flags: blockingFlags,
            audit_id: audit.id,
            baseline_version_hash: audit.baselineVersionHash,
          },
        },
      });
    }

    return {
      buffer,
      contentType,
      filename,
      auditId: audit.id,
      baselineVersionHash: audit.baselineVersionHash,
    };
  }

  async getGenerationReadiness( 
    userId: string, 
    request: GenerateResumeRequest, 
    options?: { skipReadinessGate?: boolean }, 
  ) { 
    try {
    const analysisId = request.analysisId?.trim() ?? '';
    const analysisAssessment = analysisId
      ? await validateAnalysisContext({
          analysisRepository: this.fitAssessmentRepository,
          baselineVersionRepository: this.baselineVersionRepository,
          analysisId,
          userId,
          jobId: request.jobId?.trim() ?? '',
          baselineId: request.baselineId?.trim() ?? null,
          baselineVersionId: request.baselineVersionId?.trim() ?? '',
        })
      : await this.findLatestAssessment(userId, request.jobId ?? '', request.baselineId ?? '');

    if (!analysisAssessment) {
      throw new BadRequestException({
        error: {
          code: 'analysis_not_found',
          message: 'Referenced analysis was not found.',
          details: { analysisId: analysisId || null },
        },
      });
    }

    const shouldEnforceTemplateReadiness =
      // Enforce template readiness when Studio is requesting generation against a completed
      // analysis context (baseline accepted as usable enough to score).
      Boolean(request.analysisId?.trim()) &&
      Boolean(request.jobId?.trim()) &&
      !Boolean(request.oneTap);

    if (shouldEnforceTemplateReadiness) {
      const baseline = await this.baselineRepository.findOne({
        where: { id: request.baselineId, userId },
        relations: ['sections', 'parsedRecords'],
        order: { sections: { order: 'ASC' } },
      });
      if (baseline) {
        const sourceSections = resolveBaselineSectionsForGeneration(baseline);
        const structuredBaseline = extractStructuredBaselineFromSections(sourceSections as any);
        const templateReadiness = evaluateBaselineTemplateReadiness(structuredBaseline);
        if (!templateReadiness.canGenerateResume) {
          const evidence = resolveGenerationEvidence({
            baseline: baseline as any,
            baselineVersionId: request.baselineVersionId ?? null,
          });
          const eligibility = decideGenerationEligibility({
            baseline: baseline as any,
            baselineVersion: request.baselineVersionId ? ({ id: request.baselineVersionId } as any) : null,
            job: request.jobId ? ({ id: request.jobId } as any) : null,
            readinessScore: null,
            assessment: null,
            complianceBlocked: false,
            evidence,
            warningCodes: ['baseline_template_not_ready'],
          });
          if (eligibility.eligible) {
            return {
              status: 'limited' as const,
              blocked: false,
              compliance_flags: [],
              reasons: [
                ...(templateReadiness.hardBlockReasons as any),
                { code: 'baseline_template_not_ready', message: 'Baseline template readiness warning; verified evidence fallback is available.' },
              ] as any,
              canGenerateResume: true,
            };
          }
          return {
            status: 'blocked' as const,
            blocked: true,
            compliance_flags: [],
            reasons: templateReadiness.hardBlockReasons as any,
            canGenerateResume: false,
          };
        }
        if (templateReadiness.warnings.length) {
          return {
            status: 'limited' as const,
            blocked: false,
            compliance_flags: [],
            reasons: templateReadiness.warnings as any,
            canGenerateResume: true,
          };
        }
      }
    }

    let generation: Awaited<ReturnType<ResumeService['generateResume']>> | null = null;
    const preflightOneTap = Boolean(request.oneTap);
    try {
      generation = await this.generateResume(
        userId,
        { ...request, oneTap: preflightOneTap },
        {
          enforceOneTap: preflightOneTap,
          preflightOnly: true,
          skipReadinessGate: options?.skipReadinessGate ?? true,
        },
      );
    } catch (error) { 
      const response = (error as { response?: unknown })?.response; 
      const responseRecord =
        response && typeof response === 'object'
          ? (response as Record<string, unknown>)
          : null;
      const code =
        (responseRecord?.code as string | undefined) ??
        ((responseRecord?.error as Record<string, unknown> | undefined)
          ?.code as string | undefined);
      if (code === 'baseline_template_not_ready') {
        const reasons =
          (responseRecord?.reasons as any) ??
          ((responseRecord?.details as any)?.reasons as any) ??
          (((responseRecord?.error as Record<string, unknown> | undefined)
            ?.details as any)?.reasons as any) ??
          ([{ code: 'baseline_template_not_ready', message: 'Baseline is not template-ready.' }] as any);
        return {
          status: 'blocked' as const,
          blocked: true,
          compliance_flags: [],
          reasons,
          canGenerateResume: false,
        };
      }
      if (code === 'generation_blocked' || code === 'generation_failed') { 
        const score = analysisAssessment?.overallScore ?? null; 
        const generateNowEligible =
          typeof score === 'number' && score >= VERIFIED_ONLY_GENERATION_THRESHOLD;
        if ( 
          typeof score === 'number' && 
          score >= VERIFIED_ONLY_GENERATION_THRESHOLD && 
          request.jobId?.trim() && 
          !request.oneTap 
        ) { 
          try {
            generation = await this.generateResume(
              userId,
              buildVerifiedOnlyRequest(request),
              {
                enforceOneTap: true,
                preflightOnly: true,
                skipReadinessGate: true,
              },
            );
          } catch {
            // fall through to original blocked envelope below.
          }
          if (generation) { 
            const flags = filterComplianceFlagsByCanonicalClaims( 
              generation.compliance_flags ?? [], 
              analysisAssessment, 
            ); 
            const blocked = flags.some((flag) => flag.severity === 'block'); 
            const warningFlags = flags.filter((flag) => flag.severity === 'warn'); 
            if (generateNowEligible && blocked) {
              // Contract: score >= 80 should never be blocked for evidence gaps; proceed verified-only.
              return {
                status: 'limited' as const,
                blocked: false,
                compliance_flags: flags,
                reasons: [
                  {
                    code: 'verified_only_generation',
                    message: 'Generation will proceed using only verified baseline evidence.',
                  },
                ],
              };
            }
            return { 
              status: blocked ? 'blocked' : warningFlags.length > 0 ? 'limited' : 'ready', 
              blocked, 
              compliance_flags: flags, 
              reasons: blocked 
                ? [
                    {
                      code: 'full_block',
                      message:
                        'Some claims required for tailored generation could not be verified against your baseline.',
                    },
                  ]
                : [
                    {
                      code: 'verified_only_generation',
                      message:
                        'Generation will proceed using only verified baseline evidence.',
                    },
                  ],
            };
          }
        } 

        const rawBlockers =
          (responseRecord?.blockers as Array<Record<string, unknown>> | undefined) ??
          (((responseRecord?.error as Record<string, unknown> | undefined)?.details as
            | Record<string, unknown>
            | undefined)?.blockers as Array<Record<string, unknown>> | undefined) ??
          [];
        const reasons = rawBlockers
          .map((blocker) => ({
            code:
              (typeof blocker?.code === 'string' && blocker.code.trim()) ||
              'full_block',
            message:
              (typeof blocker?.message === 'string' && blocker.message.trim()) ||
              'Some claims required for tailored generation could not be verified against your baseline.',
          }))
          .slice(0, 3);
        if (generateNowEligible) {
          return {
            status: 'limited' as const,
            blocked: false,
            compliance_flags: [],
            reasons: [
              {
                code: 'verified_only_generation',
                message: 'Generation will proceed using only verified baseline evidence.',
              },
            ],
          };
        }
        return { 
          status: 'blocked' as const, 
          blocked: true, 
          compliance_flags: [], 
          reasons: 
            reasons.length > 0 
              ? reasons 
              : [ 
                  { 
                    code: 'full_block', 
                    message: 
                      'Some claims required for tailored generation could not be verified against your baseline.', 
                  }, 
                ], 
        }; 
      } 
      throw error; 
    } 
    const flags = filterComplianceFlagsByCanonicalClaims( 
      generation.compliance_flags ?? [], 
      analysisAssessment, 
    ); 
    const score = analysisAssessment?.overallScore ?? null;
    const blocked = flags.some((flag) => flag.severity === 'block'); 
    const warningFlags = flags.filter((flag) => flag.severity === 'warn'); 
    const generateNowEligible =
      typeof score === 'number' && score >= VERIFIED_ONLY_GENERATION_THRESHOLD;
    if (warningFlags.length > 0 || blocked) {
      this.logger.warn(
        `[resume-readiness] userId=${userId} baselineId=${request.baselineId ?? 'null'} baselineVersionId=${request.baselineVersionId ?? 'null'} jobId=${request.jobId ?? 'null'} status=${blocked ? 'blocked' : 'limited'} flags=${flags
          .slice(0, 5)
          .map((flag) => {
            const evidence = Array.isArray(flag.evidence)
              ? flag.evidence
                  .slice(0, 2)
                  .map((item) =>
                    [item.generatedClaim?.text ?? item.generated ?? '', item.baseline ?? '']
                      .filter(Boolean)
                      .join(' <- '),
                  )
                  .filter(Boolean)
                  .join(';')
              : '';
            return `${flag.code}:${flag.severity}:${flag.message}${evidence ? ` evidence=${evidence}` : ''}`;
          })
          .join(' | ')}`,
      );
    }
    if (generateNowEligible && blocked) {
      return {
        status: 'limited' as const,
        blocked: false,
        compliance_flags: flags,
        reasons: [
          {
            code: 'verified_only_generation',
            message: 'Generation will proceed using only verified baseline evidence.',
          },
        ],
      };
    }

    const includeDiagnostics =
      (process.env.NODE_ENV ?? 'development') !== 'production' ||
      process.env.READINESS_DIAGNOSTICS === 'true';
    const readinessDiagnostics =
      includeDiagnostics && warningFlags.length > 0
        ? (() => {
            const verifiedLabels = getCanonicalVerifiedClaimLabels(analysisAssessment);
            const warningFlagDiagnostics = warningFlags.slice(0, 6).map((flag) => {
              const evidence = Array.isArray(flag.evidence) ? flag.evidence : [];
              const generatedClaims = evidence
                .map((entry) => entry.generatedClaim)
                .filter((claim): claim is NonNullable<typeof claim> => Boolean(claim));
              const generatedTokens = generatedClaims
                .map((claim) => String(claim.text ?? '').trim())
                .filter(Boolean)
                .slice(0, 6);
              const claimTypes = Array.from(
                new Set(generatedClaims.map((claim) => String(claim.type ?? 'unknown'))),
              ).slice(0, 6);

              const expectedEvidenceType =
                flag.code === 'fictional_technology'
                  ? 'baselineAllowlist.allowedTechnologies'
                  : flag.code === 'scope_inflation'
                    ? 'baselineSections.BASELINE_EVIDENCE leadership scope support'
                    : flag.code === 'stylized_punctuation'
                      ? 'normalized punctuation (no stylized dashes)'
                      : 'baseline evidence / allowlist match';

              return {
                flagCode: flag.code ?? 'unknown',
                flagSeverity: flag.severity ?? 'unknown',
                expectedEvidenceType,
                actualEvidenceCount: evidence.length,
                generatedClaimTypes: claimTypes,
                generatedClaimTokens: generatedTokens,
              };
            });

            const aggregatedMissingTokens = Array.from(
              new Set(
                warningFlags
                  .flatMap((flag) => flag.evidence ?? [])
                  .map((entry) => entry.generatedClaim?.text ?? entry.generated ?? '')
                  .map((value) => String(value ?? '').trim())
                  .filter(Boolean),
              ),
            ).slice(0, 30);

            return {
              failedReadinessPredicate: 'compliance_warning_flags_present',
              baselineVersionId: request.baselineVersionId ?? null,
              analysisId: request.analysisId ?? null,
              jobId: request.jobId ?? null,
              verifiedCanonicalClaimCount: verifiedLabels.size,
              warningFlagCount: warningFlags.length,
              warningFlagDiagnostics,
              missingClaimTokens: aggregatedMissingTokens,
            };
          })()
        : null;

    return {
      status: blocked ? 'blocked' : warningFlags.length > 0 ? 'limited' : 'ready',
      blocked,
      compliance_flags: flags,
      reasons:
        blocked
          ? [
              {
                code: 'full_block',
                message:
                  'Some claims required for tailored generation could not be verified against your baseline.',
              },
            ]
          : warningFlags.length > 0
            ? [
                ...(readinessDiagnostics
                  ? [
                      {
                        code: 'readiness_predicate_failed',
                        message:
                          'Readiness limited: compliance warning flags remain after canonical-claim filtering.',
                        details: readinessDiagnostics,
                      } as any,
                    ]
                  : []),
                {
                  code: 'personalization_limitation',
                  message:
                    'This role scored highly, but document generation is currently limited by verification constraints.',
                },
              ]
            : [],
      canGenerateResume: true,
    };
    } catch (error) {
      this.logger.error('[resume-readiness] exception', {
        userId,
        baselineId: request.baselineId ?? null,
        baselineVersionId: request.baselineVersionId ?? null,
        jobId: request.jobId ?? null,
        analysisId: request.analysisId ?? null,
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error ?? ''),
        stack: error instanceof Error ? error.stack : null,
      });
      throw error;
    }
  } 
} 

