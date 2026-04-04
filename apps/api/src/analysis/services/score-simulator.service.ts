import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from '../../jobs/job.entity';
import { FitAssessment } from '../fit-assessment.entity';

type ScoreBreakdownDimension = {
  key: string;
  label: string;
  score: number;
  weight: number;
};

type ImprovementOpportunity = {
  categoryKey: string;
  categoryLabel: string;
  currentSignal: string;
  roleExpectation: string;
  estimatedScore: number;
  delta: number;
  explanation: string;
};

type ScoreSimulationResult = {
  improvementOpportunities: ImprovementOpportunity[];
};

type SimulationMeta = {
  categoryLabel: string;
  roleExpectation: string;
  currentSignalFromPercent: (percent: number) => string;
  explanation: string;
};

const DIMENSION_META: Record<string, SimulationMeta> = {
  role_scope_and_seniority: {
    categoryLabel: 'Leadership Scope',
    roleExpectation: 'Role expects leadership scope closer to 20 or more reports.',
    currentSignalFromPercent: (percent) =>
      `Current verified leadership scope signal is ${percent.toFixed(0)}%.`,
    explanation:
      'If verified baseline evidence shows broader leadership scope, compatibility for this role would likely improve.',
  },
  support_operations_and_process_rigor: {
    categoryLabel: 'Support Operations',
    roleExpectation:
      'Role expects stronger ownership of scaled support operations and process outcomes.',
    currentSignalFromPercent: (percent) =>
      `Current verified support operations signal is ${percent.toFixed(0)}%.`,
    explanation:
      'If your baseline includes additional verified process ownership evidence, compatibility for this role could improve.',
  },
  tooling_and_platform_experience: {
    categoryLabel: 'Systems Alignment',
    roleExpectation:
      'Role expects deeper ownership of core systems and platform tooling.',
    currentSignalFromPercent: (percent) =>
      `Current verified systems alignment signal is ${percent.toFixed(0)}%.`,
    explanation:
      'If verified baseline evidence shows stronger systems ownership, compatibility for this role would likely improve.',
  },
  domain_and_business_context: {
    categoryLabel: 'Industry Context',
    roleExpectation:
      'Role expects closer alignment with the target industry and business context.',
    currentSignalFromPercent: (percent) =>
      `Current verified industry context signal is ${percent.toFixed(0)}%.`,
    explanation:
      'If your baseline includes additional verified domain context evidence, compatibility for this role could improve.',
  },
  change_leadership_and_customer_advocacy: {
    categoryLabel: 'Change Leadership',
    roleExpectation:
      'Role expects stronger evidence of change leadership and customer impact.',
    currentSignalFromPercent: (percent) =>
      `Current verified change leadership signal is ${percent.toFixed(0)}%.`,
    explanation:
      'If verified baseline evidence shows broader change leadership impact, compatibility for this role would likely improve.',
  },
};

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

@Injectable()
export class ScoreSimulatorService {
  constructor(
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentsRepository: Repository<FitAssessment>,
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
  ) {}

  async getSimulation(userId: string, assessmentId: string): Promise<ScoreSimulationResult> {
    const assessment = await this.fitAssessmentsRepository.findOne({
      where: {
        id: assessmentId,
        userId,
      },
    });

    if (!assessment) {
      throw new NotFoundException('Fit assessment not found');
    }

    const breakdown = this.buildScoreBreakdown(assessment);
    const totalScore = breakdown.dimensions.reduce((sum, dimension) => sum + dimension.score, 0);

    // Keep simulation bound to the user/job context without altering scoring inputs.
    await this.jobsRepository.findOne({
      where: {
        id: assessment.jobId,
        userId,
      },
      select: ['id'],
    });

    const opportunities = breakdown.dimensions
      .map((dimension) => {
        const missingPoints = Math.max(0, dimension.weight - dimension.score);
        const percent = dimension.weight > 0 ? (dimension.score / dimension.weight) * 100 : 0;
        const meta = DIMENSION_META[dimension.key] ?? {
          categoryLabel: dimension.label,
          roleExpectation: `Role expects stronger verified evidence for ${dimension.label.toLowerCase()}.`,
          currentSignalFromPercent: (rawPercent: number) =>
            `Current verified ${dimension.label.toLowerCase()} signal is ${rawPercent.toFixed(0)}%.`,
          explanation:
            'If verified baseline evidence shows stronger alignment in this area, compatibility for this role would likely improve.',
        };

        return {
          categoryKey: dimension.key,
          categoryLabel: meta.categoryLabel,
          currentSignal: meta.currentSignalFromPercent(Math.max(0, Math.min(100, percent))),
          roleExpectation: meta.roleExpectation,
          estimatedScore: roundToTenth(Math.min(100, totalScore + missingPoints)),
          delta: roundToTenth(missingPoints),
          explanation: meta.explanation,
        };
      })
      .filter((opportunity) => opportunity.delta > 1)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 3);

    return {
      improvementOpportunities: opportunities,
    };
  }

  private buildScoreBreakdown(assessment: FitAssessment): {
    dimensions: ScoreBreakdownDimension[];
  } {
    const meta: Array<{ key: string; label: string; weight: number }> = [
      {
        key: 'role_scope_and_seniority',
        label: 'Leadership Scope',
        weight: 25,
      },
      {
        key: 'support_operations_and_process_rigor',
        label: 'Support Operations and Process Rigor',
        weight: 25,
      },
      {
        key: 'tooling_and_platform_experience',
        label: 'Tooling and Platform Experience',
        weight: 20,
      },
      {
        key: 'domain_and_business_context',
        label: 'Domain and Business Context',
        weight: 15,
      },
      {
        key: 'change_leadership_and_customer_advocacy',
        label: 'Change Leadership and Customer Advocacy',
        weight: 15,
      },
    ];

    const dimensionPoints = assessment.scoringV2?.rubric?.dimensionPoints;
    if (dimensionPoints) {
      return {
        dimensions: meta.map((entry) => {
          const raw = dimensionPoints[entry.key as keyof typeof dimensionPoints];
          const boundedScore = Math.max(
            0,
            Math.min(entry.weight, roundToTenth(typeof raw === 'number' ? raw : 0)),
          );
          return {
            key: entry.key,
            label: entry.label,
            score: boundedScore,
            weight: entry.weight,
          };
        }),
      };
    }

    const legacyPercents = {
      role_scope_and_seniority:
        assessment.dimensionScores?.experienceAlignment ?? 0,
      support_operations_and_process_rigor:
        assessment.dimensionScores?.leadershipLevel ?? 0,
      tooling_and_platform_experience:
        assessment.dimensionScores?.technicalPlatformFit ?? 0,
      domain_and_business_context:
        assessment.dimensionScores?.industryContext ?? 0,
      change_leadership_and_customer_advocacy:
        assessment.dimensionScores?.strategicTacticalFit ?? 0,
    };

    return {
      dimensions: meta.map((entry) => {
        const percent = legacyPercents[entry.key as keyof typeof legacyPercents];
        const score = roundToTenth((Math.max(0, Math.min(100, percent)) / 100) * entry.weight);
        return {
          key: entry.key,
          label: entry.label,
          score,
          weight: entry.weight,
        };
      }),
    };
  }
}
