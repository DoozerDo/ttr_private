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
import { CriticalFlowEventType, CriticalFlowTrackerService } from '../support/critical-flow-tracker.service';
import { WorkflowIdempotencyService } from '../common/workflow-idempotency.service';
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
import {
  buildResumeDraftSections,
  extractEvidenceUnitsFromLogicalUnits,
  reconstructLogicalTextUnits,
  type ResumeDraftSection,
  validateResumeDraftBulletAnchors,
} from './resume-draft-bullets';
import {
  buildNormalizedResumeDocument,
  buildResumePlainText,
  mapNormalizedResumeToDocxModel,
  normalizeNormalizedResumeDocument,
  validateNormalizedResumeDocument,
} from './resume-normalization';
import { polishNormalizedResumeDocument } from '../language-style-pass';
import type { DocumentStrategyPlanLike } from '../document-strategy-plan.types';
import {
  buildBaselineEvidenceTermInventory,
  detectClaimRiskForBullet,
  summarizeClaimRisk,
} from './claim-risk';
import { validateAnalysisContext } from '../common/analysis-context-binding';
import { filterComplianceFlagsByCanonicalClaims } from '../common/readiness-claim-truth';
import { validateGenerationTrace } from '../generation/generation-validation';
import type { ArtifactTraceAudit } from '../generation/artifact-trace-audit';
import { buildArtifactFailurePayload } from '../generation/artifact-failure';
import type {
  DocumentGenerationExports,
  NormalizedResumeDocument,
  UserSafeDisplayPayload,
} from '../documents/normalized-document.models';
import { SyntheticMetadataInput } from '../synthetic/synthetic-metadata.types';

export type GenerateResumeRequest = {
  baselineId: string;
  baselineVersionId?: string;
  jobId?: string | null;
  analysisId?: string;
  oneTap?: boolean;
  editedResume?: NormalizedResumeDocument;
  documentStrategyPlan?: DocumentStrategyPlanLike;
};

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

  private ensureOneTapAllowed(assessment?: FitAssessment | null) {
    if (!assessment || assessment.overallScore < AUTO_GENERATE_THRESHOLD) {
      throw new UnprocessableEntityException({
        error: {
          code: 'fit_score_too_low',
          message: `One tap resume generation requires fit score >= ${AUTO_GENERATE_THRESHOLD}.`,
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

  private buildSuccessDisplayPayload(): UserSafeDisplayPayload {
    return {
      title: 'Resume generated successfully',
      description: 'Your resume draft is ready for preview and export.',
      reasons: [],
      cta: {
        label: 'Review results',
        href: '/results',
      },
    };
  }

  private buildResumeTraceAudit(
    sections: ResumeExportSection[],
    resumeInputSections: BaselineSection[],
  ): ArtifactTraceAudit {
    const availableEvidenceIds = resumeInputSections.flatMap((section) => {
      const logicalUnits = reconstructLogicalTextUnits(section.content ?? '');
      return extractEvidenceUnitsFromLogicalUnits(section.id, logicalUnits).map((unit) => unit.id);
    });

    const traceMap: Record<string, string[]> = {};
    const tracedLines: Array<{ id: string; text: string; sourceEvidenceIds?: string[] }> = [];
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
        tracedLines.push({ id: lineId, text, sourceEvidenceIds: ids });
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

    return {
      traceMap,
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
            [entry.startDate, entry.endDate].filter(Boolean).join(' - ') ??
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
        (sum, section) => sum + reconstructLogicalTextUnits(section.content ?? '').length,
        0,
      );
    const extractedEvidenceUnits = payload.resumeInputSections
      .filter((section) => String(section.sectionType ?? section.type ?? '').toUpperCase() === 'EXPERIENCE')
      .reduce((sum, section) => {
        const logicalUnits = reconstructLogicalTextUnits(section.content ?? '');
        return sum + extractEvidenceUnitsFromLogicalUnits(section.id, logicalUnits).length;
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
      const logicalUnits = reconstructLogicalTextUnits(section.content ?? '');
      const evidenceUnits = extractEvidenceUnitsFromLogicalUnits(section.id, logicalUnits);

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
    const recordResumeEvent = (success: boolean) => {
      void this.criticalFlowTrackerService?.recordCriticalFlowEvent({
        flow: success
          ? CriticalFlowEventType.RESUME_GENERATED_SUCCESS
          : CriticalFlowEventType.RESUME_GENERATED_FAILURE,
        areaOrRoute: 'resume',
      });
    };
    let dedupeKey: string | undefined;
    let reservationRunId: string | undefined;
    try {
      const shouldEnforceOneTap = options?.enforceOneTap ?? true;
      const preflightOnly = options?.preflightOnly ?? false;
      const baselineId = request.baselineId?.trim();
      const baselineVersionId = request.baselineVersionId?.trim();
      const jobId = request.jobId?.trim();
      const analysisId = request.analysisId?.trim();

      if (!baselineId) {
        throw new BadRequestException('baselineId is required');
      }
      if (!baselineVersionId) {
        throw new BadRequestException('baselineVersionId is required');
      }
      if (!jobId) {
        throw new BadRequestException('jobId is required');
      }
      if (!analysisId) {
        throw new BadRequestException({
          error: {
            code: 'analysis_context_mismatch',
            message: 'Generation request does not match the analyzed context.',
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

      const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections', 'parsedRecords'],
      order: { sections: { order: 'ASC' }, parsedRecords: { createdAt: 'DESC' } },
    });

      if (!baseline) {
        throw new NotFoundException('Baseline not found');
      }

    const baselineVersion = await this.baselineVersionRepository.findOne({
      where: { id: baselineVersionId, baselineId: baseline.id },
    });

    if (!baselineVersion) {
      throw new NotFoundException('Baseline version not found');
    }
    if (!baselineVersion.hash) {
      throw new BadRequestException('Baseline version hash missing');
    }

    await validateAnalysisContext({
      analysisRepository: this.fitAssessmentRepository,
      baselineVersionRepository: this.baselineVersionRepository,
      analysisId,
      userId,
      jobId,
      baselineId: baseline.id,
      baselineVersionId: baselineVersion.id,
    });

    if (!options?.skipReadinessGate) {
      const readiness = await this.getGenerationReadiness(userId, request, {
        skipReadinessGate: true,
      });
      if (readiness.status !== 'ready') {
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
    const resumeInputSections =
      this.promoteExperienceLikeSections(allowedSections);

    const baselineText = allowedSections
      .map((section) => section.content ?? '')
      .join('\n');
    const insufficientBaselineDetails =
      getInsufficientExtractedTextDetails(baselineText);
    if (insufficientBaselineDetails) {
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
    const gapInsights =
      job && latestAssessment
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
    const draftJobText = [job?.rawDescription ?? '', gapContextText]
      .filter(Boolean)
      .join('\n');

    let sections = this.sanitizeDraftSections(buildResumeDraftSections(resumeInputSections, {
      jobText: draftJobText || null,
      gapGuidance: gapGuidance
        ? {
            strengthSignals: gapGuidance.strengthSignals,
            gapSignals: gapGuidance.gapSignals,
      }
      : undefined,
      claimRiskInventory,
      documentStrategyPlan: request.documentStrategyPlan ?? undefined,
    }));
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
    const traceSourceSections = this.cloneDraftSections(sections as ResumeDraftSection[]);
    const claimRiskSummary = summarizeClaimRisk(
      sections.flatMap((section) => section.bullets.map((bullet) => bullet.claimRisk)),
    );
    const identity = resolveBaselineIdentity(baseline);
    const normalizedDocument = buildNormalizedResumeDocument(
      sections as ResumeExportSection[],
      identity,
      { documentStrategyPlan: request.documentStrategyPlan ?? undefined },
    );
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
    const bulletAnchorValidation = validateResumeDraftBulletAnchors(
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
      this.ensureOneTapAllowed(latestAssessment);
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

    if (complianceBlocked) {
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

    const resumeTraceAudit = this.buildResumeTraceAudit(
      traceSourceSections as unknown as ResumeExportSection[],
      resumeInputSections,
    );

    if (preflightOnly) {
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
      };
    }

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
    const reservation = await this.workflowIdempotencyService.reserve<ResumeGenerationResponse>({
      userId,
      operationName: 'generation.resume',
      dedupeKey,
      runId: audit.id,
    });
    reservationRunId = reservation.runId;

    if (reservation.status === 'existing_completed' && reservation.responseBody) {
      return {
        ...(reservation.responseBody as ResumeGenerationResponse),
        idempotency: {
          status: reservation.status,
          runId: reservation.runId,
          dedupeKey,
          reused: true,
        },
      } as ResumeGenerationResponse;
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

    const trackerEntry =
      await this.applicationsService.upsertPreparedFromResumeGeneration({
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
      }, syntheticMetadata);
    const opportunity = await this.opportunitiesService.createFromResumeStudio(
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

    const display = this.buildSuccessDisplayPayload();
    const exports: DocumentGenerationExports = { docx: true, pdf: true };
    recordResumeEvent(true);
    const response: ResumeGenerationResponse = {
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
      compliance_blocked: complianceBlocked,
      audit_id: audit.id,
      auditId: audit.id,
      baseline_version_hash: audit.baselineVersionHash,
      quality,
      traceMap: resumeTraceAudit.traceMap,
      debugTrace: resumeTraceAudit.debugTrace,
      exports,
      preview: {
        resume: normalizedDocument,
      },
      trackerEntryId: trackerEntry.id,
      trackerStatus: trackerEntry.status,
      opportunityId: opportunity?.id ?? null,
      claimRiskSummary,
      gapAnalysis: gapInsights,
      gapGuidance,
      display,
      safeDisplay: display,
      internal: {
        auditId: audit.id,
        baselineVersionHash: audit.baselineVersionHash,
        complianceFlags,
        resumeGenerationStage: experienceDiagnostics.resumeGenerationStage,
        resumeGenerationReason: experienceDiagnostics.resumeGenerationReason,
        resumeGenerationDiagnostics: experienceDiagnostics,
        normalizationDiagnostics: experienceDiagnostics,
      },
      idempotency: {
        status: reservation.status,
        runId: reservation.runId,
        dedupeKey,
        reused: reservation.status === 'existing_completed',
      },
    };
    await this.workflowIdempotencyService.complete({
      userId,
      operationName: 'generation.resume',
      dedupeKey,
      runId: reservation.runId,
      responseBody: response,
    });
    return response;
    } catch (error) {
      recordResumeEvent(false);
      if (dedupeKey) {
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
    const analysisAssessment = await validateAnalysisContext({
      analysisRepository: this.fitAssessmentRepository,
      baselineVersionRepository: this.baselineVersionRepository,
      analysisId: request.analysisId?.trim() ?? '',
      userId,
      jobId: request.jobId?.trim() ?? '',
      baselineId: request.baselineId?.trim() ?? null,
      baselineVersionId: request.baselineVersionId?.trim() ?? '',
    });

    let generation: Awaited<ReturnType<ResumeService['generateResume']>>;
    try {
      generation = await this.generateResume(
        userId,
        { ...request, oneTap: false },
        {
          enforceOneTap: false,
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
      if (code === 'generation_blocked' || code === 'generation_failed') {
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
    const blocked = flags.some((flag) => flag.severity === 'block');
    const warningFlags = flags.filter((flag) => flag.severity === 'warn');
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
                {
                  code: 'personalization_limitation',
                  message:
                    'This role scored highly, but document generation is currently limited by verification constraints.',
                },
              ]
            : [],
    };
  }
}

