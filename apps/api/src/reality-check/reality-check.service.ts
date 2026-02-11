import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { CxFitV2Result } from '../analysis/cx-fit-scoring-v2';
import { scoreCxFitV2 } from '../analysis/cx-fit-scoring-v2';
import { Baseline } from '../baseline/baseline.entity';
import { BaselineSection } from '../baseline/baseline-section.entity';
import { Job } from '../jobs/job.entity';
import type { ToolCoverage } from '../scoring/fit-score/tool-extractor';
import { evaluateToolCoverage } from '../scoring/fit-score/tool-extractor';
import {
  RealityCheckAnswer,
  RealityCheckAnswerInput,
  RealityCheckOutcome,
  RealityCheckQuestion,
  RealityCheckQuestionOption,
} from './reality-check.types';
import { RealityCheckRepository } from './reality-check.repository';

type RealityCheckContext = {
  job: Job;
  baseline: Baseline;
  baselineSections: BaselineSection[];
  jobText: string;
  baselineText: string;
  cxFit: CxFitV2Result;
  toolCoverage: ToolCoverage;
  missingSkillOptions: string[];
};

@Injectable()
export class RealityCheckService {
  private readonly multiSelectLimit = 8;

  constructor(
    private readonly realityCheckRepository: RealityCheckRepository,
    @InjectRepository(Baseline)
    private readonly baselineRepository: Repository<Baseline>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
  ) {}

  async getLatestRealityCheck(
    userId: string,
    jobId: string,
    baselineId: string,
  ) {
    await this.ensureJobForUser(userId, jobId);
    const baseline = await this.loadBaselineForUser(userId, baselineId);
    if (!baseline) {
      throw new NotFoundException('Baseline not found');
    }
    const existing =
      await this.realityCheckRepository.findLatestByJobAndBaseline(
        jobId,
        baselineId,
      );
    if (!existing) {
      throw new NotFoundException('Reality check not found');
    }
    return existing;
  }

  async createRealityCheck(
    userId: string,
    jobId: string,
    baselineId: string,
    answers: RealityCheckAnswerInput[],
  ) {
    if (!Array.isArray(answers) || answers.length === 0) {
      throw new BadRequestException('Answers are required');
    }

    const { job, baseline, context } = await this.buildRealityCheckContext(
      userId,
      jobId,
      baselineId,
    );
    const questions = this.generateQuestions(context);
    const validatedAnswers = this.validateAnswers(questions, answers);
    const outcomeState = this.computeOutcome(
      context,
      questions,
      validatedAnswers,
    );

    return this.realityCheckRepository.createRealityCheck({
      jobId: job.id,
      baselineId: baseline.id,
      questions,
      answers: validatedAnswers,
      triggeredBy: outcomeState.triggeredBy,
      outcome: outcomeState.outcome,
      baselineUpdateSuggested: outcomeState.baselineUpdateSuggested,
      suggestedBaselineSections: outcomeState.suggestedBaselineSections,
      version: 1,
    });
  }

  private async ensureJobForUser(userId: string, jobId: string) {
    const job = await this.jobRepository.findOne({
      where: { id: jobId, userId },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  private async loadBaselineForUser(userId: string, baselineId: string) {
    return this.baselineRepository.findOne({
      where: { id: baselineId, userId },
      relations: ['sections'],
      order: { sections: { order: 'ASC' } },
    });
  }

  private throwBaselineRequired(): never {
    throw new BadRequestException({
      error: {
        code: 'BASELINE_REQUIRED',
        message: 'Baseline is required for Reality Check',
      },
    });
  }

  private async ensureBaselineForRealityCheck(
    userId: string,
    baselineId: string,
  ) {
    const baseline = await this.loadBaselineForUser(userId, baselineId);
    if (!baseline) {
      this.throwBaselineRequired();
    }
    return baseline;
  }

  private async buildRealityCheckContext(
    userId: string,
    jobId: string,
    baselineId: string,
  ) {
    const baseline = await this.ensureBaselineForRealityCheck(
      userId,
      baselineId,
    );
    const job = await this.ensureJobForUser(userId, jobId);
    const context = this.buildContext(job, baseline);
    return { baseline, job, context };
  }

  async prepareQuestionSet(userId: string, jobId: string, baselineId: string) {
    const { context } = await this.buildRealityCheckContext(
      userId,
      jobId,
      baselineId,
    );
    return { questions: this.generateQuestions(context) };
  }

  private buildContext(job: Job, baseline: Baseline): RealityCheckContext {
    const baselineSections = (baseline.sections ?? []).sort(
      (a, b) => a.order - b.order,
    );
    const baselinePayloadSections = baselineSections.map((section) => ({
      type: section.sectionType ?? section.type,
      content: section.content,
    }));

    const jobText = this.buildJobText(job);
    const baselineText = baselinePayloadSections
      .map((section) => section.content)
      .join('\n');
    const cxFit = scoreCxFitV2({
      job: {
        rawDescription: job.rawDescription,
        normalizedResponsibilities: job.normalizedResponsibilities ?? [],
        normalizedRequirements: job.normalizedRequirements ?? [],
      },
      jobTitle: job.title ?? undefined,
      baselineSections: baselinePayloadSections,
    });

    const toolCoverage = evaluateToolCoverage(jobText, baselineText);
    const missingSkillOptions = this.buildMissingSkillOptions(
      jobText,
      baselineText,
      toolCoverage,
    );

    return {
      job,
      baseline,
      baselineSections,
      jobText,
      baselineText,
      cxFit,
      toolCoverage,
      missingSkillOptions,
    };
  }

  private buildJobText(job: Job) {
    const normalizedSegments = [
      ...(job.normalizedResponsibilities ?? []),
      ...(job.normalizedRequirements ?? []),
    ]
      .map((segment) => segment?.trim())
      .filter(Boolean);

    if (normalizedSegments.length > 0) {
      return normalizedSegments.join('\n');
    }

    return job.rawDescription ?? '';
  }

  private buildMissingSkillOptions(
    jobText: string,
    baselineText: string,
    coverage: ToolCoverage,
  ) {
    const required = (coverage.missingRequired ?? [])
      .map((term) => term.trim())
      .filter(Boolean);
    const uniqueRequired = [...new Set(required)];

    const jobKeywords = this.normalizeKeywords(jobText);
    const baselineKeywords = this.normalizeKeywords(baselineText);

    const candidates = [...jobKeywords.entries()]
      .filter(
        ([keyword]) =>
          !baselineKeywords.has(keyword) && !uniqueRequired.includes(keyword),
      )
      .sort((a, b) => {
        const delta =
          (jobKeywords.get(b[0]) ?? 0) - (jobKeywords.get(a[0]) ?? 0);
        if (delta !== 0) return delta;
        return a[0].localeCompare(b[0]);
      })
      .map(([keyword]) => keyword);

    const options: string[] = [];
    for (const value of uniqueRequired) {
      if (options.length >= this.multiSelectLimit) break;
      if (!options.includes(value)) {
        options.push(value);
      }
    }

    for (const candidate of candidates) {
      if (options.length >= this.multiSelectLimit) break;
      if (!options.includes(candidate)) {
        options.push(candidate);
      }
    }

    return options;
  }

  private normalizeKeywords(text: string) {
    const normalized = text.toLowerCase();
    const tokens =
      normalized.match(/[a-z0-9]+/g)?.filter((token) => token.length >= 3) ??
      [];
    const frequencies = new Map<string, number>();
    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
    return frequencies;
  }

  private generateQuestions(
    context: RealityCheckContext,
  ): RealityCheckQuestion[] {
    const questions: RealityCheckQuestion[] = [];

    questions.push({
      id: 'role_evolution',
      type: 'boolean',
      prompt:
        'Since this baseline was created, have you held a role or title that is not reflected here?',
      mapsToSections: ['experience', 'summary'],
      gatingTag: 'role_evolution',
    });

    questions.push({
      id: 'scope_verification',
      type: 'boolean',
      prompt:
        'Has the scope of your work expanded (team size, region, or business function) since this baseline was created?',
      mapsToSections: ['leadership', 'experience'],
      gatingTag: 'scope_verification',
    });

    if (context.missingSkillOptions.length) {
      const options =
        context.missingSkillOptions.map<RealityCheckQuestionOption>(
          (skill) => ({
            value: skill,
            label: skill,
          }),
        );

      questions.push({
        id: 'skill_currency',
        type: 'multi_select',
        prompt:
          'Which of these skills or tools does the target job require that you are using today but are not described in this baseline?',
        options,
        mapsToSections: ['skills'],
        gatingTag: 'skill_currency',
      });
    }

    questions.push({
      id: 'time_relevance',
      type: 'boolean',
      prompt:
        'Is this baseline representative of what you have done in the last 12 to 18 months?',
      mapsToSections: ['summary', 'experience'],
      gatingTag: 'time_relevance',
    });

    questions.push({
      id: 'summary_confidence',
      type: 'boolean',
      prompt:
        'Does this baseline fully describe your current responsibilities and outcomes?',
      mapsToSections: ['summary'],
      gatingTag: 'summary_confidence',
    });

    return questions;
  }

  private validateAnswers(
    questions: RealityCheckQuestion[],
    answers: RealityCheckAnswerInput[],
  ): RealityCheckAnswer[] {
    if (!questions.length) {
      throw new BadRequestException(
        'No Reality Check questions were generated',
      );
    }

    const questionMap = new Map(
      questions.map((question) => [question.id, question]),
    );
    const seen = new Set<string>();
    const validated: RealityCheckAnswer[] = [];

    for (const answer of answers) {
      const question = questionMap.get(answer.questionId);
      if (!question) {
        throw new BadRequestException(
          `Unknown questionId: ${answer.questionId}`,
        );
      }

      if (seen.has(question.id)) {
        throw new BadRequestException(
          `Duplicate answer for question: ${question.id}`,
        );
      }

      seen.add(question.id);

      if (answer.type !== question.type) {
        throw new BadRequestException(
          `Question ${question.id} expected type ${question.type}`,
        );
      }

      const value = answer.value;

      switch (question.type) {
        case 'boolean':
          if (typeof value !== 'boolean') {
            throw new BadRequestException(
              `Question ${question.id} requires a boolean value`,
            );
          }
          break;
        case 'single_select': {
          if (typeof value !== 'string') {
            throw new BadRequestException(
              `Question ${question.id} requires a single select value`,
            );
          }
          if (!question.options?.some((option) => option.value === value)) {
            throw new BadRequestException(
              `Invalid option for question ${question.id}`,
            );
          }
          break;
        }
        case 'multi_select': {
          if (!Array.isArray(value)) {
            throw new BadRequestException(
              `Question ${question.id} requires an array`,
            );
          }
          if (value.length > this.multiSelectLimit) {
            throw new BadRequestException(
              `Question ${question.id} accepts at most ${this.multiSelectLimit} selections`,
            );
          }
          if (!question.options?.length) {
            throw new BadRequestException(
              `Question ${question.id} has no options`,
            );
          }
          for (const candidate of value) {
            if (typeof candidate !== 'string') {
              throw new BadRequestException(
                `Invalid multi select value for ${question.id}`,
              );
            }
            if (
              !question.options.some((option) => option.value === candidate)
            ) {
              throw new BadRequestException(
                `Invalid option for question ${question.id}`,
              );
            }
          }
          break;
        }
        default:
          throw new BadRequestException(
            `Unsupported question type: ${String(question.type)}`,
          );
      }

      validated.push({
        questionId: question.id,
        type: question.type,
        value,
      });
    }

    if (validated.length !== questions.length) {
      throw new BadRequestException(
        'All Reality Check questions must be answered',
      );
    }

    return validated;
  }

  private computeOutcome(
    context: RealityCheckContext,
    questions: RealityCheckQuestion[],
    answers: RealityCheckAnswer[],
  ) {
    const answerMap = new Map(
      answers.map((answer) => [answer.questionId, answer]),
    );
    const triggeredTags: string[] = [];

    for (const question of questions) {
      const answer = answerMap.get(question.id);
      if (!answer) continue;
      if (this.isAnswerTriggeringUpdate(question, answer)) {
        const tag = question.gatingTag ?? question.id;
        if (!triggeredTags.includes(tag)) {
          triggeredTags.push(tag);
        }
      }
    }

    const mismatchReasons = this.detectMismatchReasons(context);
    if (!triggeredTags.length && mismatchReasons.length) {
      return {
        outcome: RealityCheckOutcome.MISMATCH,
        triggeredBy: mismatchReasons,
        baselineUpdateSuggested: false,
        suggestedBaselineSections: [] as string[],
      };
    }

    if (triggeredTags.length) {
      return {
        outcome: RealityCheckOutcome.UPDATE_RECOMMENDED,
        triggeredBy: triggeredTags,
        baselineUpdateSuggested: true,
        suggestedBaselineSections: this.deriveSuggestedSections(
          questions,
          answers,
        ),
      };
    }

    return {
      outcome: RealityCheckOutcome.VALID,
      triggeredBy: [],
      baselineUpdateSuggested: false,
      suggestedBaselineSections: [],
    };
  }

  private isAnswerTriggeringUpdate(
    question: RealityCheckQuestion,
    answer: RealityCheckAnswer,
  ) {
    if (question.type === 'boolean') {
      if (
        question.id === 'time_relevance' ||
        question.id === 'summary_confidence'
      ) {
        return answer.value === false;
      }
      return answer.value === true;
    }

    if (question.id === 'skill_currency' && Array.isArray(answer.value)) {
      return answer.value.length > 0;
    }

    return false;
  }

  private detectMismatchReasons(context: RealityCheckContext) {
    const reasons: string[] = [];
    const { cxFit, toolCoverage } = context;
    const scopeScore = Math.round(
      cxFit.rubric.dimensionPercents.role_scope_and_seniority,
    );
    const bandDelta = cxFit.debug.bandDelta;
    const bandGap = Math.abs(bandDelta);
    const leadershipScore = Math.round(
      Math.max(0, Math.min(100, 100 - Math.min(100, bandGap * 15))),
    );
    const missingToolCount = toolCoverage.missingRequired.length;

    if (bandGap >= 3 && scopeScore < 65 && leadershipScore < 60) {
      reasons.push('seniority_mismatch');
    }

    if (missingToolCount >= 3 && scopeScore < 60) {
      reasons.push('core_skill_mismatch');
    }

    return reasons;
  }

  private deriveSuggestedSections(
    questions: RealityCheckQuestion[],
    answers: RealityCheckAnswer[],
  ) {
    const answerMap = new Map(
      answers.map((answer) => [answer.questionId, answer]),
    );
    const sections = new Set<string>();

    for (const question of questions) {
      const answer = answerMap.get(question.id);
      if (!answer) continue;
      if (!this.isAnswerTriggeringUpdate(question, answer)) continue;
      for (const section of question.mapsToSections ?? []) {
        if (section) {
          sections.add(section);
        }
      }
    }

    return [...sections];
  }
}
