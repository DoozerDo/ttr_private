import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { ComplianceService } from '../compliance/compliance.service';
import { ComplianceAction } from '../compliance/compliance.types';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Job } from '../jobs/job.entity';
import { StarStory } from '../star-stories/star-story.entity';
import { InterviewQuestionGeneratorService } from './interview-question-generator.service';
import type { InterviewGap } from './interview-types';
import { BaselineVersion } from '../baseline/baseline-version.entity';

export type StudyPacket = {
  job: Pick<Job, 'id' | 'title' | 'company'>;
  fitSnapshot: {
    assessmentId: string;
    baselineId: string;
    overallScore: number;
    verdict: string;
    strengths: string[];
    gaps: string[];
    createdAt: string;
  } | null;
  recommendedStories: StarStory[];
  recentStories: StarStory[];
  questions: ReturnType<InterviewQuestionGeneratorService['generateQuestions']>;
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
    private readonly questionGenerator: InterviewQuestionGeneratorService,
    private readonly complianceService: ComplianceService,
  ) {}

  private async requireJob(jobId: string, userId: string) {
    const job = await this.jobRepository.findOne({ where: { id: jobId, userId } });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  async buildStudyPacket(userId: string, jobId: string): Promise<StudyPacket> {
    const job = await this.requireJob(jobId, userId);

    const assessment = await this.fitAssessmentRepository.findOne({
      where: { userId, jobId },
      order: { createdAt: 'DESC' },
    });

    const fitSnapshot = assessment
      ? {
          assessmentId: assessment.id,
          baselineId: assessment.baselineId,
          overallScore: assessment.overallScore,
          verdict: assessment.verdict,
          strengths: assessment.strengths ?? [],
          gaps: assessment.gaps ?? [],
          createdAt: assessment.createdAt.toISOString(),
        }
      : null;

    const stories = await this.starStoryRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 12,
    });

    const normalizedGaps = fitSnapshot?.gaps ?? [];
    const storyMatches = normalizedGaps.length
      ? stories.filter((story) => this.matchesAnyGap(story, normalizedGaps))
      : [];

    const recommendedStories = storyMatches.length
      ? storyMatches.slice(0, 5)
      : stories.slice(0, 5);

    const gapsForQuestions = normalizedGaps.length
      ? normalizedGaps.map((gap, index) => this.gapFromText(gap, index))
      : this.defaultGapsFromJob(job);

    const questions = this.questionGenerator.generateQuestions(gapsForQuestions);

    return {
      job: { id: job.id, title: job.title, company: job.company },
      fitSnapshot,
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
  ) {
    const job = await this.requireJob(jobId, userId);

    if (!baselineVersionId?.trim()) {
      throw new BadRequestException('baselineVersionId is required');
    }

    const baselineVersion = await this.baselineVersionRepository.findOne({
      where: { id: baselineVersionId.trim() },
      relations: ['baseline', 'baseline.sections'],
    });

    if (!baselineVersion || !baselineVersion.baseline) {
      throw new NotFoundException('Baseline version not found');
    }

    if (baselineVersion.baseline.userId !== userId) {
      throw new NotFoundException('Baseline version not found');
    }

    if (!baselineVersion.hash) {
      throw new BadRequestException('Baseline version hash missing');
    }

    const header = job.company ? `Hi ${job.company} team,` : 'Hi there,';
    const roleLine = job.title ? `Thank you for the chance to discuss the ${job.title} role.` : undefined;
    const notesLine = notes?.trim() ? `I appreciated discussing ${notes.trim()}.` : undefined;
    const close = 'Please let me know if any additional context would be helpful.';

    const paragraphs = [header, roleLine, notesLine, 'I remain excited about the opportunity to contribute.', close]
      .filter(Boolean)
      .join(' ');

    const content = `${paragraphs} Thank you for your time.`.trim();
    const normalizedContent = this.complianceService.normalizeText(content);

    const writingFlags = this.complianceService.enforceResumeWritingRules({
      rawContent: normalizedContent,
    });

    const { blocked, complianceFlags } = await this.complianceService.validateAndAudit({
      action: ComplianceAction.FOLLOW_UP_GENERATION,
      actorId: userId,
      baselineVersion,
      job,
      outputHash: createHash('sha256').update(normalizedContent).digest('hex'),
      baselineSections: this.complianceService.normalizeSectionsForOutput(
        baselineVersion.baseline?.sections ?? [],
      ),
      generatedSections: [{ title: 'Follow Up', content: normalizedContent }],
      extraFlags: writingFlags,
    });

    if (blocked) {
      const message = complianceFlags
        .map((flag) => flag.message)
        .filter(Boolean)
        .join('; ');
      throw new BadRequestException(message || 'Follow up could not be generated due to compliance.');
    }

    return {
      job: { id: job.id, title: job.title, company: job.company },
      content: normalizedContent,
      complianceFlags,
    };
  }

  private matchesAnyGap(story: StarStory, gaps: string[]): boolean {
    const haystack = `${story.title} ${story.competencies?.join(' ') ?? ''}`.toLowerCase();
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
    const snippets = (job.normalizedResponsibilities ?? []).slice(0, 3);

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
