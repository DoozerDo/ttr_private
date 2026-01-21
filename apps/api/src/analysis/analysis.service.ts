import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { Baseline } from '../baseline/baseline.entity';
import {
  BaselineIncludePolicy,
  BaselineSection,
  BaselineSectionType,
} from '../baseline/baseline-section.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { ComplianceService } from '../compliance/compliance.service';
import {
  ComplianceAction,
  ComplianceFlag,
  ComplianceFlagSeverity,
} from '../compliance/compliance.types';
import { Interview } from '../interviews/interview.entity';
import { RecommendedAddition } from '../interviews/interview-types';
import { Job, JobIngestionMethod } from '../jobs/job.entity';
import { CalibrationWeights, User } from '../users/user.entity';
import { ExpandedFitAssessment } from './expanded-fit-assessment.entity';
import {
  FitAssessment,
  FitAssessmentVerdict,
  FitDimensionScores,
} from './fit-assessment.entity';
import type { RunFitAssessmentDto } from './dto/run-fit-assessment.dto';
import type { RunExpandedFitAssessmentDto } from './dto/run-expanded-fit-assessment.dto';
import {
  DimensionWeightOverrides,
  FitScoringService,
} from './fit-scoring.service';
import { scoreCxFitV2 } from './cx-fit-scoring-v2';

import { countWords, getCharCount, sha256 } from '../common/text-metrics';
import type { FitScoreVerdictLabel } from '../scoring/fit-score/fit-verdict';

export type AnalysisRequest = {
  baselineId: string;
  jobId?: string;
  jobDescription?: string;
};

export type AnalysisResult = {
  ok: boolean;
  baselineId: string;
  score: number;
  strengths: string[];
  gaps: string[];
  summary: string;
  compliance_flags?: Array<{ code: string; message?: string }>;
  audit_id?: string | null;
  auditId?: string | null;
  baseline_version_hash?: string | null;
};

type FitScoreJobInput = {
  id?: string;
  raw_jd_text?: string;
  raw_jd?: string;
  parsed_jd?: {
    responsibilities?: string[];
    requirements?: string[];
  };
};

export type DebugSource = 'header' | 'query' | 'body' | 'none';

export type FitScoreRequest = {
  job?: FitScoreJobInput;
  baseline_version_id?: string;
  debug?: boolean;
  debugSource?: DebugSource;
  selected_block_ids?: string[];
};

type ScoringProofSnapshot = {
  assessmentId: string | null;
  baselineTextCharsScored: number;
  jobTextCharsScored: number;
  truncationAppliedBaseline: boolean;
  truncationAppliedJob: boolean;
  normalizedResponsibilitiesCount: number;
  normalizedRequirementsCount: number;
};

type FitScoreResponse = {
  fit_score: number;
  overall_score: number;
  verdict: FitScoreVerdictLabel;
  breakdown: {
    experience_alignment: number;
    leadership_level: number;
    technical_platform_fit: number;
    industry_context: number;
    strategic_vs_tactical: number;
  };
  strengths?: string[];
  gaps?: string[];
  compliance_flags?: Array<{ code: string; message?: string }>;
  audit_id?: string | null;
  auditId?: string | null;
  assessmentId?: string;
  jobId?: string;
  baselineId?: string;
  baselineVersion?: number | null;
  createdAt?: Date;
  score?: number;
  overallScore?: number;
  dimensionScores?: FitAssessment['dimensionScores'];
  complianceFlags?: FitAssessment['complianceFlags'];
  summary?: string;
  debug?: FitScoreDebugPayload;
  scoringProof?: ScoringProofSnapshot;

  // Added to match runtime return payload.
  scoring_v2?: unknown;
};

type FitScoreDebugPayload = {
  request: {
    debugEnabled: boolean;
    debugSource: DebugSource;
    baselineVersionId: string | null;
    jobId: string | null;
  };
  baseline: {
    baselineId: string;
    baselineVersionId: string;
    baselineVersionNumber: number | null;
    baselineContentHash: string | null;
    baselineExtractedTextChars: number;
    baselineExtractedTextWords: number;
    baselineSectionsCharCounts: Array<{
      type: string | null;
      charCount: number;
    }>;
  };
  job: {
    jobId: string | null;
    jobSource: 'url' | 'paste' | 'unknown';
    rawTextChars: number;
    rawTextWords: number;
    normalizedTextChars: number;
    normalizedTextWords: number;
    chosenTextSourceForScoring: 'normalized' | 'raw' | 'unknown';
    chosenTextChars: number;
    chosenTextWords: number;
    chosenTextHash: string;
  };
  scoring: {
    overallScoreBeforeAnyCapsOrGates: number;
    overallScoreAfterCapsOrGates: number;
    dimensionScores: FitDimensionScores;
    verdict: FitAssessmentVerdict;
    weights?: Record<keyof FitDimensionScores, number>;
    normalizedWeightTotal?: number;
    gatesApplied?: string[];
    penaltiesApplied?: string[];
    summaryBasis: string;
  };
};

@Injectable()
export class AnalysisService {
  constructor(
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(BaselineSection)
    private readonly baselineSectionRepository: Repository<BaselineSection>,
    @InjectRepository(BaselineBlockPolicy)
    private readonly baselineBlockPolicyRepository: Repository<BaselineBlockPolicy>,
    @InjectRepository(BaselineVersion)
    private readonly baselineVersionRepository: Repository<BaselineVersion>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(Interview)
    private readonly interviewRepository: Repository<Interview>,
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentRepository: Repository<FitAssessment>,
    @InjectRepository(ExpandedFitAssessment)
    private readonly expandedFitAssessmentRepository: Repository<ExpandedFitAssessment>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly fitScoringService: FitScoringService,
    private readonly complianceService: ComplianceService,
  ) {}

  // VERIFY: Confirm default calibration values with product stakeholders.
  private readonly defaultCalibration: {
    profileName: string;
    weights: CalibrationWeights;
  } = {
    profileName: 'default',
    weights: {
      dimensionA: 1,
      dimensionB: 1,
      dimensionC: 1,
      dimensionD: 1,
      dimensionE: 1,
    },
  };

  private normalizeKeywords(text: string) {
    const tokens =
      text
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter((token) => token.length >= 3) ?? [];

    const frequencies = new Map<string, number>();
    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }

    return frequencies;
  }

  private sortByFrequency(values: Map<string, number>, items: string[]) {
    return [...items].sort((a, b) => {
      const delta = (values.get(b) ?? 0) - (values.get(a) ?? 0);
      if (delta !== 0) return delta;
      return a.localeCompare(b);
    });
  }

  private buildBaselineText(sections: BaselineSection[]) {
    return sections
      .filter((section) => section.includePolicy !== BaselineIncludePolicy.NEVER)
      .map((section) => section.content)
      .join('\n');
  }

  private buildSummaryFromTerms(strengths: string[], gaps: string[]) {
    if (!strengths.length && !gaps.length) {
      return 'No keywords found in the job description.';
    }
    const total = strengths.length + gaps.length;
    return `Matched ${strengths.length} of ${total} key terms from the job description.`;
  }

  private buildInputsHash(
    job: Job,
    baseline: Baseline,
    dimensionWeights: DimensionWeightOverrides,
  ) {
    const sectionPayload =
      baseline.sections?.map((section) => ({
        type: section.sectionType ?? section.type,
        content: section.content,
        includePolicy: section.includePolicy,
        order: section.order,
      })) ?? [];

    const payload = {
      job: {
        rawDescription: job.rawDescription,
        normalizedResponsibilities: job.normalizedResponsibilities ?? [],
        normalizedRequirements: job.normalizedRequirements ?? [],
        title: job.title ?? null,
        company: job.company ?? null,
      },
      baseline: {
        id: baseline.id,
        version: baseline.version ?? null,
        sections: sectionPayload,
      },
      calibration: dimensionWeights,
    };

    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private coerceComplianceFlags(
    flags?: ComplianceFlag[] | string[] | null,
  ) {
    if (!flags?.length) return undefined;
    return flags.map((flag) => {
      if (typeof flag === 'string') {
        return { code: flag, message: flag };
      }
      return { code: flag.code, message: flag.message };
    });
  }

  private mapComplianceStringsToFlags(
    flags?: string[] | null,
  ): ComplianceFlag[] | undefined {
    if (!flags?.length) return undefined;
    return flags.map((flag) => ({
      code: flag as any,
      message: flag,
      severity: ComplianceFlagSeverity.BLOCK,
    }));
  }

  private normalizeAdditions(
    additions?: (string | RecommendedAddition)[] | null,
  ) {
    if (!additions?.length) return [];
    return additions
      .map((entry) => (typeof entry === 'string' ? entry : entry?.text)?.trim())
      .filter((entry): entry is string => Boolean(entry));
  }

  private assertJobInput(job?: FitScoreJobInput) {
    const rawText = job?.raw_jd_text ?? job?.raw_jd;
    const hasRaw = Boolean(rawText?.trim());
    const parsed = job?.parsed_jd;
    const hasParsed = Boolean(
      parsed &&
        ((parsed.responsibilities && parsed.responsibilities.length > 0) ||
          (parsed.requirements && parsed.requirements.length > 0)),
    );
    const hasId = Boolean(job?.id?.trim());
    const providedCount = Number(hasRaw) + Number(hasParsed);

    if (hasId && providedCount > 0) {
      throw new BadRequestException({
        error: {
          code: 'JD_INPUT_AMBIGUOUS',
          message: 'Provide either job.id or JD content, not both.',
        },
      });
    }

    if (!hasId && providedCount === 0) {
      throw new BadRequestException({
        error: {
          code: 'JD_INPUT_MISSING',
          message: 'Provide exactly one of raw_jd_text (or raw_jd) or parsed_jd.',
        },
      });
    }

    if (providedCount > 1) {
      throw new BadRequestException({
        error: {
          code: 'JD_INPUT_AMBIGUOUS',
          message: 'Provide exactly one of raw_jd_text (or raw_jd) or parsed_jd.',
        },
      });
    }
  }

  async getCalibration(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const profileName =
      user.calibrationProfileName ?? this.defaultCalibration.profileName;
    const weights =
      user.calibrationWeights ??
      ({ ...this.defaultCalibration.weights } as CalibrationWeights);

    return { ok: true, profileName, weights };
  }

  async saveCalibration(
    userId: string,
    payload: { profileName?: string; weights?: CalibrationWeights | null },
  ) {
    const profileName = payload.profileName?.trim();

    if (!profileName) {
      throw new BadRequestException('profileName is required');
    }

    // VERIFY: Validate calibration weight ranges with data science.
    if (!payload.weights) {
      throw new BadRequestException('weights are required');
    }

    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.calibrationProfileName = profileName;
    user.calibrationWeights = payload.weights;

    await this.usersRepository.save(user);

    return { ok: true, profileName, weights: payload.weights };
  }

  private buildJobPayloadFromParsed(job: FitScoreJobInput) {
    const parsed = job.parsed_jd ?? {};
    const responsibilities = parsed.responsibilities ?? [];
    const requirements = parsed.requirements ?? [];
    const synthesizedRaw = [...responsibilities, ...requirements]
      .join('\n')
      .trim();

    return {
      title: null,
      company: null,
      rawDescription: job.raw_jd_text ?? job.raw_jd ?? synthesizedRaw,
      normalizedResponsibilities: responsibilities,
      normalizedRequirements: requirements,
      sourceUrl: null,
    };
  }

  private mapCalibrationToDimensionWeights(weights?: CalibrationWeights | null) {
    return {
      experienceAlignment: weights?.dimensionA ?? 1,
      technicalPlatformFit: weights?.dimensionB ?? 1,
      leadershipLevel: weights?.dimensionC ?? 1,
      strategicTacticalFit: weights?.dimensionD ?? 1,
      industryContext: weights?.dimensionE ?? 1,
    } satisfies DimensionWeightOverrides;
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

  private async loadBaselineForVersion(userId: string, baselineVersionId?: string) {
    if (!baselineVersionId?.trim()) {
      throw new BadRequestException('baseline_version_id is required');
    }

    const baselineVersion = await this.baselineVersionRepository.findOne({
      where: { id: baselineVersionId },
      relations: ['baseline'],
    });

    if (!baselineVersion || !baselineVersion.baseline) {
      throw new NotFoundException('Baseline version not found');
    }

    if (baselineVersion.baseline.userId !== userId) {
      throw new NotFoundException('Baseline version not found');
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineVersion.baselineId, userId },
      relations: ['sections'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    const policies = await this.baselineBlockPolicyRepository.find({
      where: { baselineVersionId: baselineVersion.id },
      relations: ['baselineSection'],
      order: { order: 'ASC' },
    });

    baseline.sections = this.applyPoliciesToSections(baseline.sections ?? [], policies);

    const additionSections =
      (baselineVersion.verifiedAdditions ?? []).map((content, index) => {
        const section: Partial<BaselineSection> = {
          id: `addition-${index}`,
          baselineId: baseline.id,
          sectionType: BaselineSectionType.OTHER,
          title: 'Verified addition',
          content,
          includePolicy: BaselineIncludePolicy.ALWAYS,
          order: (baseline.sections?.length ?? 0) + index,
        };
        return section as BaselineSection;
      }) ?? [];

    baseline.sections = [...(baseline.sections ?? []), ...additionSections];

    return { baseline, baselineVersion };
  }

  async scoreCompatibility(userId: string, payload: FitScoreRequest): Promise<FitScoreResponse> {
    this.assertJobInput(payload.job);

    const { baseline, baselineVersion } = await this.loadBaselineForVersion(
      userId,
      payload.baseline_version_id,
    );

    if (!baseline.sections?.length) {
      baseline.sections = await this.baselineSectionRepository.find({
        where: { baselineId: baseline.id },
        order: { order: 'ASC' },
      });
    }

    const selectedBlockIds = payload.selected_block_ids?.filter(Boolean);
    const isIncludedSection = (section: BaselineSection) =>
      section.includePolicy !== BaselineIncludePolicy.NEVER &&
      (!selectedBlockIds || selectedBlockIds.includes(section.id));
    const includedSections =
      baseline.sections
        ?.filter(isIncludedSection)
        .map((section) => ({
          type: section.sectionType ?? section.type,
          content: section.content,
        })) ?? [];

    const complianceBaselineSections =
      this.complianceService.normalizeSectionsForOutput(includedSections);

    const baselineProofText = includedSections.map((section) => section.content ?? '').join('\n');
    const baselineTextCharsScored = getCharCount(baselineProofText);

    const baselineTextForDebug = includedSections.map((section) => section.content).join('\n');
    const baselineExtractedTextChars = getCharCount(baselineTextForDebug);
    const baselineExtractedTextWords = countWords(baselineTextForDebug);
    const baselineSectionsCharCounts = includedSections.map((section) => ({
      type: section.type ?? null,
      charCount: getCharCount(section.content ?? ''),
    }));
    const baselineContentHash =
      baselineVersion.hash ?? baseline.hash ?? sha256(baselineTextForDebug);

    const calibration = await this.getCalibration(userId);
    const dimensionWeights = this.mapCalibrationToDimensionWeights(calibration.weights);

    const jobInput = payload.job ?? {};
    const jobId = jobInput.id?.trim();
    const allowDebug = Boolean(payload.debug && process.env.NODE_ENV !== 'production');

    let job: Job | null = null;
    let jobPayload: {
      title: string | null;
      company: string | null;
      rawDescription: string;
      normalizedResponsibilities: string[];
      normalizedRequirements: string[];
      sourceUrl: string | null;
    };

    if (jobId) {
      job = await this.jobRepository.findOne({
        where: { id: jobId, userId },
      });

      if (!job) {
        throw new NotFoundException('Job not found');
      }

      jobPayload = {
        title: job.title ?? null,
        company: job.company ?? null,
        rawDescription: job.rawDescription,
        normalizedResponsibilities: job.normalizedResponsibilities ?? [],
        normalizedRequirements: job.normalizedRequirements ?? [],
        sourceUrl: job.sourceUrl ?? null,
      };
    } else {
      const rawText = jobInput.raw_jd_text ?? jobInput.raw_jd;
      const hasParsed = jobInput.parsed_jd !== undefined;
      jobPayload = hasParsed
        ? this.buildJobPayloadFromParsed(jobInput)
        : {
            title: null,
            company: null,
            rawDescription: rawText ?? '',
            normalizedResponsibilities: [],
            normalizedRequirements: [],
            sourceUrl: null,
          };
    }

    const normalizedResponsibilities = jobPayload.normalizedResponsibilities ?? [];
    const normalizedRequirements = jobPayload.normalizedRequirements ?? [];
    const normalizedSegments = [...normalizedResponsibilities, ...normalizedRequirements].filter(Boolean);
    const normalizedText = normalizedSegments.join('\n');
    const normalizedTextChars = getCharCount(normalizedText);
    const normalizedTextWords = countWords(normalizedText);

    const rawText = jobPayload.rawDescription ?? '';
    const rawTextChars = getCharCount(rawText);
    const rawTextWords = countWords(rawText);
    const normalizedJobDescription = this.complianceService.normalizeText(rawText);

    const hasNormalizedText = normalizedSegments.length > 0;
    const chosenTextSourceForScoring = hasNormalizedText
      ? 'normalized'
      : rawText
      ? 'raw'
      : 'unknown';
    const chosenText = hasNormalizedText ? normalizedText : rawText;
    const chosenTextChars = getCharCount(chosenText);
    const chosenTextWords = countWords(chosenText);
    const chosenTextHash = sha256(chosenText);

    const jobSource =
      job?.jdIngestionMethod === JobIngestionMethod.URL ||
      job?.jdIngestionMethod === JobIngestionMethod.SOURCE_PROVIDER ||
      Boolean(jobPayload.sourceUrl)
        ? 'url'
        : job?.jdIngestionMethod === JobIngestionMethod.PASTE
        ? 'paste'
        : rawText
        ? 'paste'
        : 'unknown';

    const hashableJob = (job ?? {
      rawDescription: jobPayload.rawDescription,
      normalizedResponsibilities: jobPayload.normalizedResponsibilities,
      normalizedRequirements: jobPayload.normalizedRequirements,
      title: jobPayload.title,
      company: jobPayload.company,
      sourceUrl: jobPayload.sourceUrl,
    }) as Job;

    const inputsHash = this.buildInputsHash(hashableJob, baseline, dimensionWeights);

    const scoring = await this.fitScoringService.score(
      {
        job: jobPayload,
        baseline: {
          version: baselineVersion.versionNumber ?? baseline.version ?? null,
          sections: includedSections,
        },
      },
      dimensionWeights,
      { debug: allowDebug },
    );

    const scoringV2 = scoreCxFitV2({
      job: jobPayload,
      baselineSections: includedSections,
    });

    const scoringDebug = scoring.debug;
    const normalizedWeightTotal =
      scoringDebug && Object.keys(scoringDebug.weights ?? {}).length
        ? Object.values(scoringDebug.weights ?? {}).reduce((sum, value) => sum + value, 0)
        : undefined;
    const debugPayload: FitScoreDebugPayload | undefined = allowDebug
      ? {
          request: {
            debugEnabled: allowDebug,
            debugSource: payload.debugSource ?? 'none',
            baselineVersionId: baselineVersion.id,
            jobId: jobId ?? null,
          },
          baseline: {
            baselineId: baseline.id,
            baselineVersionId: baselineVersion.id,
            baselineVersionNumber: baselineVersion.versionNumber ?? baseline.version ?? null,
            baselineContentHash,
            baselineExtractedTextChars,
            baselineExtractedTextWords,
            baselineSectionsCharCounts,
          },
          job: {
            jobId: job?.id ?? null,
            jobSource,
            rawTextChars,
            rawTextWords,
            normalizedTextChars,
            normalizedTextWords,
            chosenTextSourceForScoring,
            chosenTextChars,
            chosenTextWords,
            chosenTextHash,
          },
          scoring: {
            overallScoreBeforeAnyCapsOrGates: scoringDebug?.rawScore ?? scoring.overallScore,
            overallScoreAfterCapsOrGates: scoring.overallScore,
            dimensionScores: scoring.dimensionScores,
            verdict: scoring.persistenceVerdict ?? FitAssessmentVerdict.CONSIDER,
            weights: scoringDebug?.weights,
            normalizedWeightTotal,
            gatesApplied: scoring.leadershipOverrideApplied ? ['leadership_override'] : undefined,
            penaltiesApplied: scoring.missingRequiredToolsPenalty
              ? ['missing_required_tools']
              : undefined,
            summaryBasis: 'semantic_tool_weighted_fit',
          },
        }
      : undefined;

    const generatedSectionsForCompliance = normalizedJobDescription
      ? [{ title: 'Job Description', content: normalizedJobDescription }]
      : undefined;

    let savedAssessment: FitAssessment | null = null;

    if (job) {
      const assessment = this.fitAssessmentRepository.create({
        userId,
        jobId: job.id,
        baselineId: baseline.id,
        baselineVersion: baselineVersion.versionNumber ?? baseline.version ?? null,
        overallScore: scoring.overallScore,
        verdict: scoring.persistenceVerdict ?? FitAssessmentVerdict.CONSIDER,
        dimensionScores: scoring.dimensionScores,
        strengths: scoring.strengths,
        gaps: scoring.gaps,
        complianceFlags: scoring.complianceFlags,
        inputsHash,
      });

      savedAssessment = await this.fitAssessmentRepository.save(assessment);
    }

    const compliance = await this.complianceService.validateAndAudit({
      action: ComplianceAction.FIT_SCORE,
      actorId: userId,
      baselineVersion,
      job: job ?? null,
      outputHash: inputsHash,
      baselineSections: complianceBaselineSections,
      generatedSections: generatedSectionsForCompliance,
      extraFlags: this.mapComplianceStringsToFlags(scoring.complianceFlags),
    });

    if (compliance.blocked) {
      throw new BadRequestException({
        error: {
          code: 'compliance_blocked',
          message: 'Compliance validation failed.',
          details: { compliance_flags: compliance.complianceFlags },
        },
      });
    }

    const breakdown = {
      experience_alignment: scoring.dimensionScores.experienceAlignment,
      leadership_level: scoring.dimensionScores.leadershipLevel,
      technical_platform_fit: scoring.dimensionScores.technicalPlatformFit,
      industry_context: scoring.dimensionScores.industryContext,
      strategic_vs_tactical: scoring.dimensionScores.strategicTacticalFit,
    };

    const scoringProof: ScoringProofSnapshot = {
      assessmentId: null,
      baselineTextCharsScored: baselineExtractedTextChars,
      jobTextCharsScored: chosenTextChars,
      truncationAppliedBaseline: false,
      truncationAppliedJob: false,
      normalizedResponsibilitiesCount: normalizedResponsibilities.length,
      normalizedRequirementsCount: normalizedRequirements.length,
    };

    return {
      fit_score: scoring.overallScore,
      overall_score: scoring.overallScore,
      verdict: scoring.verdict ?? 'consider',
      breakdown,
      strengths: scoring.strengths,
      gaps: scoring.gaps,
      compliance_flags: this.coerceComplianceFlags(scoring.complianceFlags),
      audit_id: compliance.audit.id,
      auditId: compliance.audit.id,
      assessmentId: savedAssessment?.id,
      jobId: savedAssessment?.jobId,
      baselineId: savedAssessment?.baselineId,
      baselineVersion: savedAssessment?.baselineVersion,
      createdAt: savedAssessment?.createdAt,
      scoring_v2: scoringV2,
      score: scoringV2.score,
      overallScore: scoring.overallScore,
      dimensionScores: scoring.dimensionScores,
      complianceFlags: scoring.complianceFlags,
      summary: scoring.summary,
      ...(debugPayload ? { debug: debugPayload } : {}),
      scoringProof,
    };
  }

  async analyzeForUser(userId: string, payload: AnalysisRequest): Promise<AnalysisResult> {
    const baselineId = payload.baselineId?.trim();
    if (!baselineId) {
      throw new BadRequestException('baselineId is required');
    }

    const hasJobId = Boolean(payload.jobId?.trim());
    const hasJobDescription = Boolean(payload.jobDescription?.trim());

    if (!hasJobId && !hasJobDescription) {
      throw new BadRequestException('jobId or jobDescription is required');
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    if (!baseline.sections?.length) {
      baseline.sections = await this.baselineSectionRepository.find({
        where: { baselineId: baseline.id },
        order: { order: 'ASC' },
      });
    }

    const includedSections =
      baseline.sections?.filter(
        (section) => section.includePolicy !== BaselineIncludePolicy.NEVER,
      ) ?? [];

    const complianceBaselineSections =
      this.complianceService.normalizeSectionsForOutput(includedSections);

    const jobId = payload.jobId?.trim();
    const job = jobId
      ? await this.jobRepository.findOne({
          where: { id: jobId, userId },
        })
      : null;
    const jobDescription = job
      ? job.rawDescription
      : payload.jobDescription?.trim();

    if (!jobDescription) {
      throw new NotFoundException('Job not found');
    }

    const normalizedJobDescription = this.complianceService.normalizeText(jobDescription);

    const baselineText = this.buildBaselineText(includedSections);
    const baselineKeywords = this.normalizeKeywords(baselineText);
    const jobKeywords = this.normalizeKeywords(jobDescription);

    const baselineSet = new Set(baselineKeywords.keys());
    const jobSet = new Set(jobKeywords.keys());

    const overlap = [...jobSet].filter((keyword) => baselineSet.has(keyword));
    const gaps = [...jobSet].filter((keyword) => !baselineSet.has(keyword));

    const overlapSorted = this.sortByFrequency(jobKeywords, overlap);
    const gapsSorted = this.sortByFrequency(jobKeywords, gaps);

    const total = jobSet.size;
    const matched = overlap.length;
    const score = total === 0 ? 0 : Math.round((matched / total) * 100);

    const strengths = overlapSorted.slice(0, 8);
    const gapList = gapsSorted.slice(0, 8);

    const summary =
      total === 0
        ? 'No keywords found in the job description.'
        : `Matched ${matched} of ${total} key terms from the job description.`;

    const generatedSectionsForCompliance = normalizedJobDescription
      ? [{ title: 'Job Description', content: normalizedJobDescription }]
      : undefined;

    const outputHash = sha256(`${baseline.hash ?? ''}:${normalizedJobDescription}`);

    const compliance = await this.complianceService.validateAndAudit({
      action: ComplianceAction.FIT_SCORE,
      actorId: userId,
      baselineVersion: { hash: baseline.hash } as BaselineVersion,
      job,
      outputHash,
      baselineSections: complianceBaselineSections,
      generatedSections: generatedSectionsForCompliance,
    });

    if (compliance.blocked) {
      throw new BadRequestException({
        error: {
          code: 'compliance_blocked',
          message: 'Compliance validation failed.',
          details: { compliance_flags: compliance.complianceFlags },
        },
      });
    }

    return {
      ok: true,
      baselineId: baseline.id,
      score,
      strengths,
      gaps: gapList,
      summary,
      compliance_flags: this.coerceComplianceFlags(compliance.complianceFlags),
      audit_id: compliance.audit.id,
      auditId: compliance.audit.id,
      baseline_version_hash:
        compliance.audit.baselineVersionHash ?? baseline.hash ?? null,
    };
  }

  async runFitAssessment(userId: string, payload: RunFitAssessmentDto) {
    const baselineId = payload.baselineId?.trim();
    const jobId = payload.jobId?.trim();

    if (!baselineId || !jobId) {
      throw new BadRequestException('baselineId and jobId are required');
    }

    if (payload.baselineVersion !== undefined) {
      const version = Number(payload.baselineVersion);
      if (!Number.isInteger(version) || version < 1) {
        throw new BadRequestException('baselineVersion must be a positive integer');
      }
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    if (!baseline.sections?.length) {
      baseline.sections = await this.baselineSectionRepository.find({
        where: { baselineId: baseline.id },
        order: { order: 'ASC' },
      });
    }

    const job = await this.jobRepository.findOne({
      where: { id: jobId, userId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const includedSections =
      baseline.sections?.filter(
        (section) => section.includePolicy !== BaselineIncludePolicy.NEVER,
      ) ?? [];

    const complianceBaselineSections =
      this.complianceService.normalizeSectionsForOutput(includedSections);

    const baselineProofText = includedSections.map((section) => section.content ?? '').join('\n');
    const baselineTextCharsScored = getCharCount(baselineProofText);
    const normalizedResponsibilities = job.normalizedResponsibilities ?? [];
    const normalizedRequirements = job.normalizedRequirements ?? [];
    const normalizedSegments = [...normalizedResponsibilities, ...normalizedRequirements].filter(Boolean);
    const normalizedText = normalizedSegments.join('\n');
    const rawText = job.rawDescription ?? '';
    const chosenJobText = normalizedSegments.length ? normalizedText : rawText;
    const jobTextCharsScored = getCharCount(chosenJobText);

    const scoringProofBase = {
      baselineTextCharsScored,
      jobTextCharsScored,
      truncationAppliedBaseline: false,
      truncationAppliedJob: false,
      normalizedResponsibilitiesCount: normalizedResponsibilities.length,
      normalizedRequirementsCount: normalizedRequirements.length,
    };

    const calibration = await this.getCalibration(userId);

    const dimensionWeights = this.mapCalibrationToDimensionWeights(calibration.weights);
    const inputsHash = this.buildInputsHash(job, baseline, dimensionWeights);

    const existing = await this.fitAssessmentRepository.findOne({
      where: { userId, jobId, baselineId, inputsHash },
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      const summary = this.buildSummaryFromTerms(
        existing.strengths ?? [],
        existing.gaps ?? [],
      );
      const compliance = await this.complianceService.validateAndAudit({
        action: ComplianceAction.FIT_SCORE,
        actorId: userId,
        baselineVersion: { hash: baseline.hash } as BaselineVersion,
        job,
        outputHash: inputsHash,
        baselineSections: complianceBaselineSections,
        generatedSections: summary
          ? [{ title: 'Fit scoring summary', content: summary }]
          : undefined,
        extraFlags: this.mapComplianceStringsToFlags(existing.complianceFlags),
      });

      if (compliance.blocked) {
        throw new BadRequestException({
          error: {
            code: 'compliance_blocked',
            message: 'Compliance validation failed.',
            details: { compliance_flags: compliance.complianceFlags },
          },
        });
      }

      return {
        ok: true,
        assessmentId: existing.id,
        jobId: existing.jobId,
        baselineId: existing.baselineId,
        baselineVersion: existing.baselineVersion,
        overallScore: existing.overallScore,
        score: existing.overallScore,
        verdict: existing.verdict,
        dimensionScores: existing.dimensionScores,
        strengths: existing.strengths,
      gaps: existing.gaps,
      complianceFlags: existing.complianceFlags,
      summary,
      createdAt: existing.createdAt,
      audit_id: compliance.audit.id,
      auditId: compliance.audit.id,
      scoringProof: {
        ...scoringProofBase,
        assessmentId: existing.id,
      },
      baseline_version_hash:
        compliance.audit.baselineVersionHash ?? baseline.hash ?? null,
    };
  }

    const scoring = await this.fitScoringService.score(
      {
        job: {
          rawDescription: job.rawDescription,
          normalizedResponsibilities: job.normalizedResponsibilities ?? [],
          normalizedRequirements: job.normalizedRequirements ?? [],
          title: job.title ?? null,
          company: job.company ?? null,
          sourceUrl: job.sourceUrl ?? null,
        },
        baseline: {
          version: baseline.version ?? null,
          sections: includedSections.map((section) => ({
            type: section.sectionType ?? section.type,
            content: section.content,
          })),
        },
      },
      dimensionWeights,
    );

    const generatedSectionsForCompliance = scoring.summary
      ? [{ title: 'Fit scoring summary', content: scoring.summary }]
      : undefined;

    const compliance = await this.complianceService.validateAndAudit({
      action: ComplianceAction.FIT_SCORE,
      actorId: userId,
      baselineVersion: { hash: baseline.hash } as BaselineVersion,
      job,
      outputHash: inputsHash,
      baselineSections: complianceBaselineSections,
      generatedSections: generatedSectionsForCompliance,
      extraFlags: this.mapComplianceStringsToFlags(scoring.complianceFlags),
    });

    if (compliance.blocked) {
      throw new BadRequestException({
        error: {
          code: 'compliance_blocked',
          message: 'Compliance validation failed.',
          details: { compliance_flags: compliance.complianceFlags },
        },
      });
    }

    const assessment = this.fitAssessmentRepository.create({
      userId,
      jobId,
      baselineId: baseline.id,
      baselineVersion: payload.baselineVersion ?? baseline.version ?? null,
      overallScore: scoring.overallScore,
      verdict: scoring.persistenceVerdict ?? FitAssessmentVerdict.CONSIDER,
      dimensionScores: scoring.dimensionScores,
      strengths: scoring.strengths,
      gaps: scoring.gaps,
      complianceFlags: scoring.complianceFlags,
      inputsHash,
    });

    const saved = await this.fitAssessmentRepository.save(assessment);
    return {
      ok: true,
      assessmentId: saved.id,
      jobId: saved.jobId,
      baselineId: saved.baselineId,
      baselineVersion: saved.baselineVersion,
      overallScore: saved.overallScore,
      score: saved.overallScore,
      verdict: saved.verdict,
      dimensionScores: saved.dimensionScores,
      strengths: saved.strengths,
      gaps: saved.gaps,
      complianceFlags: saved.complianceFlags,
      summary: scoring.summary,
      audit_id: compliance.audit.id,
      auditId: compliance.audit.id,
      scoringProof: {
        ...scoringProofBase,
        assessmentId: saved.id,
      },
      baseline_version_hash:
        compliance.audit.baselineVersionHash ?? baseline.hash ?? null,
      createdAt: saved.createdAt,
    };
  }

  async runExpandedFitAssessment(userId: string, payload: RunExpandedFitAssessmentDto) {
    const baselineId = payload.baselineId?.trim();
    const jobId = payload.jobId?.trim();

    if (!baselineId || !jobId) {
      throw new BadRequestException('baselineId and jobId are required');
    }

    if (payload.baselineVersion !== undefined) {
      const version = Number(payload.baselineVersion);
      if (!Number.isInteger(version) || version < 1) {
        throw new BadRequestException('baselineVersion must be a positive integer');
      }
    }

    const baseline = await this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections'],
      order: { sections: { order: 'ASC' } },
    });

    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }

    if (!baseline.sections?.length) {
      baseline.sections = await this.baselineSectionRepository.find({
        where: { baselineId: baseline.id },
        order: { order: 'ASC' } },
      );
    }

    const job = await this.jobRepository.findOne({
      where: { id: jobId, userId },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const interviewId = payload.interviewId?.trim();
    const interview = interviewId
      ? await this.interviewRepository.findOne({
          where: { id: interviewId, userId },
        })
      : null;

    if (interviewId && !interview) {
      throw new NotFoundException('Interview not found');
    }

    const additionsFromPayload = this.normalizeAdditions(payload.verifiedAdditions);
    const additions = additionsFromPayload.length
      ? additionsFromPayload
      : this.normalizeAdditions(interview?.recommendedAdditions);

    if (!additions.length) {
      throw new BadRequestException('verified additions are required for expanded scoring');
    }

    const includedSections =
      baseline.sections?.filter(
        (section) => section.includePolicy !== BaselineIncludePolicy.NEVER,
      ) ?? [];

    const complianceBaselineSections =
      this.complianceService.normalizeSectionsForOutput(includedSections);

    const calibration = await this.getCalibration(userId);
    const dimensionWeights = this.mapCalibrationToDimensionWeights(calibration.weights);
    const inputsHash = this.buildInputsHash(job, baseline, dimensionWeights);

    const scoring = await this.fitScoringService.score(
      {
        job: {
          rawDescription: job.rawDescription,
          normalizedResponsibilities: job.normalizedResponsibilities ?? [],
          normalizedRequirements: job.normalizedRequirements ?? [],
          title: job.title ?? null,
          company: job.company ?? null,
          sourceUrl: job.sourceUrl ?? null,
        },
        baseline: {
          version: payload.baselineVersion ?? baseline.version ?? null,
          sections: includedSections.map((section) => ({
            type: section.sectionType ?? section.type,
            content: section.content,
          })),
        },
        verifiedAdditions: additions,
      },
      dimensionWeights,
    );

    const additionsForCompliance = additions.map((addition, index) => ({
      title: `Verified addition ${index + 1}`,
      content: this.complianceService.normalizeText(addition),
    }));

    const generatedSectionsForCompliance = additionsForCompliance.length
      ? additionsForCompliance
      : undefined;

    const compliance = await this.complianceService.validateAndAudit({
      action: ComplianceAction.FIT_SCORE,
      actorId: userId,
      baselineVersion: { hash: baseline.hash } as BaselineVersion,
      job,
      outputHash: inputsHash,
      baselineSections: complianceBaselineSections,
      generatedSections: generatedSectionsForCompliance,
      extraFlags: this.mapComplianceStringsToFlags(scoring.complianceFlags),
    });

    if (compliance.blocked) {
      throw new BadRequestException({
        error: {
          code: 'compliance_blocked',
          message: 'Compliance validation failed.',
          details: { compliance_flags: compliance.complianceFlags },
        },
      });
    }

    const linkedAssessment = await this.fitAssessmentRepository.findOne({
      where: { userId, jobId, baselineId },
      order: { createdAt: 'DESC' },
    });

    const expansion = this.expandedFitAssessmentRepository.create({
      userId,
      jobId,
      baselineId,
      baselineVersion: payload.baselineVersion ?? baseline.version ?? null,
      fitAssessmentId: linkedAssessment?.id ?? undefined,
      interviewId: interview?.id ?? undefined,
      originalScore: scoring.originalScore,
      expandedScore: scoring.expandedScore,
      delta: scoring.delta,
      additions,
      expandedDimensionScores: scoring.expandedDimensionScores ?? scoring.dimensionScores,
    });

    const savedExpansion = await this.expandedFitAssessmentRepository.save(expansion);

    return {
      ok: true,
      expansionId: savedExpansion.id,
      fitAssessmentId: linkedAssessment?.id ?? null,
      interviewId: interview?.id ?? null,
      baselineId,
      baselineVersion: payload.baselineVersion ?? baseline.version ?? null,
      jobId,
      originalScore: scoring.originalScore,
      expandedScore: scoring.expandedScore,
      delta: scoring.delta,
      expandedDimensionScores: scoring.expandedDimensionScores ?? scoring.dimensionScores,
      dimensionScores: scoring.dimensionScores,
      strengths: scoring.strengths,
      gaps: scoring.gaps,
      complianceFlags: scoring.complianceFlags,
      appliedAdditions: scoring.appliedAdditions,
      summary: scoring.summary,
      audit_id: compliance.audit.id,
      auditId: compliance.audit.id,
      baseline_version_hash:
        compliance.audit.baselineVersionHash ?? baseline.hash ?? null,
    };
  }

  async getFitAssessments(userId: string, jobId?: string) {
    const where = jobId?.trim() ? { userId, jobId: jobId.trim() } : { userId };

    return this.fitAssessmentRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async getFitScores(userId: string, jobId?: string) {
    const assessments = await this.getFitAssessments(userId, jobId);

    return assessments.map((assessment) => ({
      id: assessment.id,
      jobId: assessment.jobId,
      fitScore: assessment.overallScore,
      createdAt: assessment.createdAt,
    }));
  }

  private async buildLatestAssessmentPayload(assessment: FitAssessment) {
    const summary = this.buildSummaryFromTerms(
      assessment.strengths ?? [],
      assessment.gaps ?? [],
    );

    const baselineVersionRecord = assessment.baselineVersion
      ? await this.baselineVersionRepository.findOne({
          where: {
            baselineId: assessment.baselineId,
            versionNumber: assessment.baselineVersion,
          },
          order: { createdAt: 'DESC' },
        })
      : null;

    return {
      ok: true,
      assessmentId: assessment.id,
      jobId: assessment.jobId,
      baselineId: assessment.baselineId,
      baselineVersionId: baselineVersionRecord?.id ?? null,
      baselineVersion: assessment.baselineVersion,
      overallScore: assessment.overallScore,
      score: assessment.overallScore,
      verdict: assessment.verdict,
      dimensionScores: assessment.dimensionScores,
      strengths: assessment.strengths,
      gaps: assessment.gaps,
      complianceFlags: assessment.complianceFlags,
      summary,
      createdAt: assessment.createdAt,
    };
  }

  async getLatestAssessment(userId: string, jobId: string) {
    const assessment = await this.fitAssessmentRepository.findOne({
      where: { userId, jobId },
      order: { createdAt: 'DESC' },
    });

    if (!assessment) {
      throw new NotFoundException('Fit assessment not found');
    }

    return this.buildLatestAssessmentPayload(assessment);
  }

  async getFitAssessmentById(userId: string, assessmentId: string) {
    const assessment = await this.fitAssessmentRepository.findOne({
      where: { id: assessmentId, userId },
    });

    if (!assessment) {
      throw new NotFoundException('Fit assessment not found');
    }

    return this.buildLatestAssessmentPayload(assessment);
  }

  async getLatestAssessmentForBaseline(
    userId: string,
    jobId: string,
    baselineId: string,
  ) {
    const assessment = await this.fitAssessmentRepository.findOne({
      where: { userId, jobId, baselineId },
      order: { createdAt: 'DESC' },
    });

    if (!assessment) {
      throw new NotFoundException('Fit assessment not found');
    }

    return this.buildLatestAssessmentPayload(assessment);
  }
}

// VERIFY:
// - Calibration weights are fetched per user and default to 1.0 for missing dimensions.
// - Inputs hash incorporates calibration to avoid stale assessments.
