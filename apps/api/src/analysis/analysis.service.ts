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
import { Job } from '../jobs/job.entity';
import { FitAssessment, FitAssessmentVerdict } from './fit-assessment.entity';
import type { RunFitAssessmentDto } from './dto/run-fit-assessment.dto';
import { FitScoringService } from './fit-scoring.service';

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

@Injectable()
export class AnalysisService {
  constructor(
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(BaselineSection)
    private readonly baselineSectionRepository: Repository<BaselineSection>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentRepository: Repository<FitAssessment>,
    private readonly fitScoringService: FitScoringService,
  ) {}

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

  private buildInputsHash(job: Job, baseline: Baseline) {
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
    };

    return createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
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

    const inputsHash = this.buildInputsHash(job, baseline);

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

    const scoring = this.fitScoringService.score({
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
    });

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
