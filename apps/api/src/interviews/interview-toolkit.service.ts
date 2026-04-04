import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { ComplianceService } from '../compliance/compliance.service';
import { ComplianceAction } from '../compliance/compliance.types';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { GapAnalysisService } from '../analysis/gap-analysis.service';
import { Job } from '../jobs/job.entity';
import { StarStory } from '../star-stories/star-story.entity';
import { InterviewQuestionGeneratorService } from './interview-question-generator.service';
import type { InterviewGap } from './interview-types';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { BaselineSection } from '../baseline/baseline-section.entity';

export type StudyPacket = {
  job: Pick<Job, 'id' | 'title' | 'company'>;
  fitSnapshot: {
    assessmentId: string;
    baselineId: string;
    overallScore: number;
    verdict: string;
    strengths: string[];
    gaps: string[];
    criticalGaps: Array<{
      gapId: string;
      title: string;
      description: string;
      severityScore: number;
      requirementEvidence: string;
      baselineEvidence: string | null;
      reasoning: string;
    }>;
    recommendedActions: string[];
    createdAt: string;
  } | null;
  interviewRiskBriefing: Array<{
    riskId: string;
    topic: string;
    whyTheyMayChallengeYou: string;
    howToAddressIt: string;
    exampleTalkingPoint: string;
    suggestedTalkingPoints: string[];
    exampleResponseStrategies: string[];
  }>;
  recommendedStories: StarStory[];
  recentStories: StarStory[];
  questions: ReturnType<InterviewQuestionGeneratorService['generateQuestions']>;
};

type FollowUpComplianceFlag = {
  code: string;
  message: string;
  severity: string;
};

@Injectable()
export class InterviewToolkitService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentRepository: Repository<FitAssessment>,
    @InjectRepository(StarStory)
    private readonly starStoryRepository: Repository<StarStory>,
    @InjectRepository(BaselineVersion)
    private readonly baselineVersionRepository: Repository<BaselineVersion>,
    @InjectRepository(BaselineSection)
    private readonly baselineSectionRepository: Repository<BaselineSection>,
    private readonly questionGenerator: InterviewQuestionGeneratorService,
    private readonly complianceService: ComplianceService,
    private readonly gapAnalysisService: GapAnalysisService,
  ) {}

  private async requireJob(jobId: string, userId: string) {
    const normalized = jobId?.trim();
    if (!normalized) throw new BadRequestException('jobId is required');

    const job = await this.jobRepository.findOne({
      where: { id: normalized, userId },
    });
    if (!job) throw new NotFoundException('Job not found');

    return job;
  }

  async buildStudyPacket(userId: string, jobId: string): Promise<StudyPacket> {
    const job = await this.requireJob(jobId, userId);

    const assessment = await this.fitAssessmentRepository.findOne({
      where: { userId, jobId: job.id },
      order: { createdAt: 'DESC' },
    });

    const baselineSections = assessment
      ? await this.baselineSectionRepository.find({
          where: { baselineId: assessment.baselineId },
          order: { order: 'ASC' },
        })
      : [];

    const gapInsights = assessment
      ? this.gapAnalysisService.analyze({
          baselineSections: baselineSections.map((section) => ({
            content: section.content ?? '',
          })),
          jobRequirements: job.normalizedRequirements ?? [],
          jobResponsibilities: job.normalizedResponsibilities ?? [],
          dimensionPercents:
            assessment.scoringV2?.rubric?.dimensionPercents ?? undefined,
        })
      : null;

    const fitSnapshot = assessment
      ? {
          assessmentId: assessment.id,
          baselineId: assessment.baselineId,
          overallScore: assessment.overallScore,
          verdict: assessment.verdict,
          strengths: gapInsights?.strengths ?? assessment.strengths ?? [],
          gaps:
            gapInsights?.criticalGaps.map((gap) => gap.title) ??
            assessment.gaps ??
            [],
          criticalGaps: gapInsights?.criticalGaps ?? [],
          recommendedActions: gapInsights?.recommendedActions ?? [],
          createdAt: assessment.createdAt.toISOString(),
        }
      : null;

    const stories = await this.starStoryRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 12,
    });

    const normalizedGaps =
      fitSnapshot?.criticalGaps?.length
        ? fitSnapshot.criticalGaps.map((gap) => gap.title)
        : fitSnapshot?.gaps ?? [];
    const storyMatches = normalizedGaps.length
      ? stories.filter((story) => this.matchesAnyGap(story, normalizedGaps))
      : [];

    const recommendedStories = storyMatches.length
      ? storyMatches.slice(0, 5)
      : stories.slice(0, 5);

    const gapsForQuestions = normalizedGaps.length
      ? normalizedGaps.map((gap, index) => this.gapFromText(gap, index))
      : this.defaultGapsFromJob(job);

    const questions =
      this.questionGenerator.generateQuestions(gapsForQuestions);

    const interviewRiskBriefing = (gapInsights?.interviewRisks ?? []).map((risk) => ({
      ...risk,
      suggestedTalkingPoints: [risk.exampleTalkingPoint],
      exampleResponseStrategies: [risk.howToAddressIt],
    }));

    return {
      job: { id: job.id, title: job.title, company: job.company },
      fitSnapshot,
      interviewRiskBriefing,
      recommendedStories,
      recentStories: stories.slice(0, 5),
      questions,
    };
  }

  async generateFollowUp(
    userId: string,
    jobId: string,
    baselineVersionId?: string | null,
    notes?: string,
  ): Promise<{
    job: { id: string; title: string | null; company: string | null };
    content: string;
    complianceFlags: FollowUpComplianceFlag[];
    auditId: string;
    baselineVersionHash: string | null;
  }> {
    const job = await this.requireJob(jobId, userId);

    const normalizedBaselineVersionId = baselineVersionId?.trim();
    if (!normalizedBaselineVersionId) {
      throw new BadRequestException('baselineVersionId is required');
    }

    const baselineVersion = await this.baselineVersionRepository.findOne({
      where: { id: normalizedBaselineVersionId },
      relations: ['baseline', 'baseline.sections'],
    });

    if (!baselineVersion || !baselineVersion.baseline) {
      throw new NotFoundException('Baseline version not found');
    }

    if (baselineVersion.baseline.userId !== userId) {
      throw new NotFoundException('Baseline version not found');
    }

    const baselineHash: string | null =
      (baselineVersion as unknown as { fileHash?: string | null }).fileHash ??
      null;

    if (!baselineHash) {
      throw new BadRequestException('Baseline version hash missing');
    }

    const header = job.company ? `Hi ${job.company} team,` : 'Hi there,';
    const roleLine = job.title
      ? `Thank you for the chance to discuss the ${job.title} role.`
      : null;
    const notesLine = notes?.trim()
      ? `I appreciated discussing ${notes.trim()}.`
      : null;
    const close =
      'Please let me know if any additional context would be helpful. Thank you for your time.';

    const content = [
      header,
      roleLine,
      notesLine,
      'I remain excited about the opportunity to contribute.',
      close,
    ]
      .filter((p): p is string => Boolean(p))
      .join(' ')
      .trim();

    const normalizedContent = this.complianceService.normalizeText(content);

    const writingFlags = this.complianceService.enforceResumeWritingRules({
      rawContent: normalizedContent,
    });

    const { blocked, complianceFlags, audit } =
      await this.complianceService.validateAndAudit({
        action: ComplianceAction.FOLLOW_UP_GENERATION,
        actorId: userId,
        baselineVersion,
        job,
        outputHash: createHash('sha256')
          .update(normalizedContent)
          .digest('hex'),
        baselineSections: this.complianceService.normalizeSectionsForOutput(
          baselineVersion.baseline?.sections ?? [],
        ),
        generatedSections: [{ title: 'Follow Up', content: normalizedContent }],
        extraFlags: writingFlags,
      });

    if (blocked) {
      throw new UnprocessableEntityException({
        error: {
          code: 'COMPLIANCE_VIOLATION',
          message: 'Compliance validation failed.',
          details: {
            compliance_flags: complianceFlags,
            audit_id: audit.id,
            baseline_version_hash: audit.baselineVersionHash,
          },
        },
      });
    }

    return {
      job: { id: job.id, title: job.title, company: job.company },
      content: normalizedContent,
      complianceFlags: this.normalizeComplianceFlags(complianceFlags),
      auditId: audit.id,
      baselineVersionHash: audit.baselineVersionHash,
    };
  }

  private normalizeComplianceFlags(input: unknown): FollowUpComplianceFlag[] {
    if (!Array.isArray(input)) return [];

    const normalized: FollowUpComplianceFlag[] = [];

    for (const entry of input) {
      if (!entry || typeof entry !== 'object') continue;

      const record = entry as Record<string, unknown>;

      const codeRaw = record.code;
      const messageRaw = record.message;
      const severityRaw = record.severity;

      const code =
        typeof codeRaw === 'string' && codeRaw.trim()
          ? codeRaw.trim()
          : 'UNKNOWN';
      const message =
        typeof messageRaw === 'string' && messageRaw.trim()
          ? messageRaw.trim()
          : 'Compliance notice';
      const severity =
        typeof severityRaw === 'string' && severityRaw.trim()
          ? severityRaw.trim()
          : 'warn';

      normalized.push({ code, message, severity });
    }

    return normalized;
  }

  private matchesAnyGap(story: StarStory, gaps: string[]): boolean {
    const haystack =
      `${story.title} ${(story.competencies ?? []).join(' ')}`.toLowerCase();
    return gaps.some((gap) => haystack.includes((gap ?? '').toLowerCase()));
  }

  private gapFromText(gap: string, index: number): InterviewGap {
    const trimmed = gap?.trim() || 'Interview prep focus';
    return {
      gapId: `gap-${index + 1}`,
      domain: 'experience',
      jdExcerpt: trimmed,
      baselineExcerpt: null,
      confidence: 'medium',
    };
  }

  private defaultGapsFromJob(job: Job): InterviewGap[] {
    const snippets: string[] = (job.normalizedResponsibilities ?? []).slice(
      0,
      3,
    );

    if (snippets.length === 0 && job.rawDescription) {
      const lines = job.rawDescription.split(/\n+/).filter(Boolean);
      snippets.push(...lines.slice(0, 2));
    }

    if (snippets.length === 0) {
      return [
        {
          gapId: 'gap-1',
          domain: 'experience',
          jdExcerpt: 'Key responsibilities for this role',
          baselineExcerpt: null,
          confidence: 'medium',
        },
      ];
    }

    return snippets.map((text, index) => this.gapFromText(text, index));
  }
}
