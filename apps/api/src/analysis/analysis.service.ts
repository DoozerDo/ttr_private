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
} from '../baseline/baseline-section.entity';
import { BaselineBlockPolicy } from '../baseline/baseline-block-policy.entity';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { Job } from '../jobs/job.entity';
import { CalibrationWeights, User } from '../users/user.entity';
import { FitAssessment, FitAssessmentVerdict } from './fit-assessment.entity';
import type { RunFitAssessmentDto } from './dto/run-fit-assessment.dto';
import {
  DimensionWeightOverrides,
  FitScoringService,
} from './fit-scoring.service';

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

export type FitScoreRequest = {
  job?: FitScoreJobInput;
  baseline_version_id?: string;
  selected_block_ids?: string[];
};

type FitScoreResponse = {
  fit_score: number;
  overall_score: number;
  verdict: 'apply' | 'consider' | 'skip';
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
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentRepository: Repository<FitAssessment>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly fitScoringService: FitScoringService,
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
    const tokens = text
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

    return createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  private coerceComplianceFlags(flags: string[] | undefined | null) {
    if (!flags?.length) return undefined;
    return flags.map((flag) => ({ code: flag, message: flag }));
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
        error: { code: 'JD_INPUT_AMBIGUOUS', message: 'Provide either job.id or JD content, not both.' },
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

    const profileName = user.calibrationProfileName ?? this.defaultCalibration.profileName;
    const weights =
      user.calibrationWeights ?? ({ ...this.defaultCalibration.weights } as CalibrationWeights);

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
    const synthesizedRaw = [...responsibilities, ...requirements].join('\n').trim();

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

    baseline.sections = this.applyPoliciesToSections(
      baseline.sections ?? [],
      policies,
    );

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
    const includedSections =
      baseline.sections
        ?.filter(
          (section) =>
            section.includePolicy !== BaselineIncludePolicy.NEVER &&
            (!selectedBlockIds || selectedBlockIds.includes(section.id)),
        )
        .map((section) => ({
          type: section.sectionType ?? section.type,
          content: section.content,
        })) ?? [];

    const calibration = await this.getCalibration(userId);
    const dimensionWeights = this.mapCalibrationToDimensionWeights(calibration.weights);

    const jobInput = payload.job ?? {};
    const jobId = jobInput.id?.trim();

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

    const scoring = this.fitScoringService.score(
      {
        job: jobPayload,
        baseline: {
          version: baselineVersion.versionNumber ?? baseline.version ?? null,
          sections: includedSections,
        },
      },
      dimensionWeights,
    );

    let savedAssessment: FitAssessment | null = null;

    if (job) {
      const assessment = this.fitAssessmentRepository.create({
        userId,
        jobId: job.id,
        baselineId: baseline.id,
        baselineVersion: baselineVersion.versionNumber ?? baseline.version ?? null,
        overallScore: scoring.overallScore,
        verdict: scoring.verdict ?? FitAssessmentVerdict.CONSIDER,
        dimensionScores: scoring.dimensionScores,
        strengths: scoring.strengths,
        gaps: scoring.gaps,
        complianceFlags: scoring.complianceFlags,
        inputsHash: null,
      });

      savedAssessment = await this.fitAssessmentRepository.save(assessment);
    }

    const breakdown = {
      experience_alignment: scoring.dimensionScores.experienceAlignment,
      leadership_level: scoring.dimensionScores.leadershipLevel,
      technical_platform_fit: scoring.dimensionScores.technicalPlatformFit,
      industry_context: scoring.dimensionScores.industryContext,
      strategic_vs_tactical: scoring.dimensionScores.strategicTacticalFit,
    };

    return {
      fit_score: scoring.overallScore,
      overall_score: scoring.overallScore,
      verdict: (scoring.verdict ?? FitAssessmentVerdict.CONSIDER).toLowerCase() as
        | 'apply'
        | 'consider'
        | 'skip',
      breakdown,
      strengths: scoring.strengths,
      gaps: scoring.gaps,
      compliance_flags: this.coerceComplianceFlags(scoring.complianceFlags),
      audit_id: savedAssessment?.id ?? null,
      assessmentId: savedAssessment?.id,
      jobId: savedAssessment?.jobId,
      baselineId: savedAssessment?.baselineId,
      baselineVersion: savedAssessment?.baselineVersion,
      createdAt: savedAssessment?.createdAt,
      score: scoring.overallScore,
      overallScore: scoring.overallScore,
      dimensionScores: scoring.dimensionScores,
      complianceFlags: scoring.complianceFlags,
      summary: scoring.summary,
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

    const jobDescription = hasJobId
      ? (await this.jobRepository.findOne({
          where: { id: payload.jobId?.trim(), userId },
        }))?.rawDescription
      : payload.jobDescription?.trim();

    if (!jobDescription) {
      throw new NotFoundException('Job not found');
    }

    const baselineText = this.buildBaselineText(baseline.sections ?? []);
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

    return {
      ok: true,
      baselineId: baseline.id,
      score,
      strengths,
      gaps: gapList,
      summary,
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
      };
    }

    const scoring = this.fitScoringService.score(
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

    const assessment = this.fitAssessmentRepository.create({
      userId,
      jobId,
      baselineId: baseline.id,
      baselineVersion: payload.baselineVersion ?? baseline.version ?? null,
      overallScore: scoring.overallScore,
      verdict: scoring.verdict ?? FitAssessmentVerdict.CONSIDER,
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
      createdAt: saved.createdAt,
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

    const summary = this.buildSummaryFromTerms(
      assessment.strengths ?? [],
      assessment.gaps ?? [],
    );

    return {
      ok: true,
      assessmentId: assessment.id,
      jobId: assessment.jobId,
      baselineId: assessment.baselineId,
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
}

// VERIFY:
// - Calibration weights are fetched per user and default to 1.0 for missing dimensions.
// - Inputs hash incorporates calibration to avoid stale assessments.
