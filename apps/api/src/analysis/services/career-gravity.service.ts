import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Job } from '../../jobs/job.entity';
import { FitAssessment } from '../fit-assessment.entity';

type ConfidenceLevel = 'High' | 'Moderate' | 'Low';

type CareerGravityInsight = {
  summary: string;
  primaryRoleFamily: string;
  secondaryRoleFamily: string | null;
  seniorityTrend: string | null;
  confidence: ConfidenceLevel;
  supportingSignals: string[];
};

type CareerGravityResponse = {
  careerGravity: CareerGravityInsight | null;
};

type AnalysisSample = {
  score: number;
  createdAt: Date;
  jobTitle: string;
  classification: string;
};

type ClusterAggregate = {
  key: string;
  label: string;
  scores: number[];
  weightedScores: number[];
  recencyHits: number;
  analyses: number;
  seniorityCounts: Map<string, number>;
};

type RoleClusterRule = {
  key: string;
  label: string;
  requiredKeywords: string[];
};

const ROLE_CLUSTER_RULES: RoleClusterRule[] = [
  {
    key: 'director_customer_operations',
    label: 'Director Customer Operations',
    requiredKeywords: ['director', 'customer', 'operations'],
  },
  {
    key: 'director_support',
    label: 'Director Support',
    requiredKeywords: ['director', 'support'],
  },
  {
    key: 'incident_management_leadership',
    label: 'Incident Management Leadership',
    requiredKeywords: ['incident', 'management'],
  },
  {
    key: 'head_of_support',
    label: 'Head of Support',
    requiredKeywords: ['head', 'support'],
  },
  {
    key: 'vp_customer_experience',
    label: 'VP Customer Experience',
    requiredKeywords: ['vp', 'customer', 'experience'],
  },
];

const FILLER_WORDS = new Set([
  'of',
  'and',
  'the',
  'for',
  'to',
  'a',
  'an',
  'in',
  'at',
  'with',
  'on',
  'role',
  'position',
]);

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function titleCase(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

function normalizeTitleTokens(title?: string | null): string[] {
  if (!title) return [];
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !FILLER_WORDS.has(token));
}

function resolveClusterLabel(jobTitle: string): { key: string; label: string } {
  const tokens = normalizeTitleTokens(jobTitle);

  for (const rule of ROLE_CLUSTER_RULES) {
    const matches = rule.requiredKeywords.every((keyword) => tokens.includes(keyword));
    if (matches) {
      return {
        key: rule.key,
        label: rule.label,
      };
    }
  }

  if (tokens.length === 0) {
    return {
      key: 'general_alignment',
      label: 'General Role Alignment',
    };
  }

  const compact = tokens.slice(0, 4).join('_');
  return {
    key: compact,
    label: titleCase(tokens.slice(0, 4).join(' ')),
  };
}

function classificationForScore(score: number): string {
  if (score >= 95) return 'Elite Match';
  if (score >= 85) return 'Top Tier Candidate';
  if (score >= 70) return 'Competitive Alignment';
  if (score >= 50) return 'Developing Fit';
  return 'Misaligned Role';
}

function classificationWeight(classification: string): number {
  switch (classification) {
    case 'Elite Match':
      return 1.06;
    case 'Top Tier Candidate':
      return 1.04;
    case 'Competitive Alignment':
      return 1.02;
    case 'Developing Fit':
      return 0.98;
    default:
      return 0.94;
  }
}

function detectSeniority(title: string): string | null {
  const lowered = title.toLowerCase();
  if (/\bvp\b|\bvice president\b/.test(lowered)) return 'VP';
  if (/\bhead\b/.test(lowered)) return 'Head';
  if (/\bdirector\b/.test(lowered)) return 'Director';
  if (/\bmanager\b/.test(lowered)) return 'Manager';
  return null;
}

@Injectable()
export class CareerGravityService {
  constructor(
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentsRepository: Repository<FitAssessment>,
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
  ) {}

  async getCareerGravity(userId: string): Promise<CareerGravityResponse> {
    const assessments = await this.fitAssessmentsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    if (assessments.length < 2) {
      return { careerGravity: null };
    }

    const jobIds = Array.from(new Set(assessments.map((assessment) => assessment.jobId)));
    const jobs = jobIds.length
      ? await this.jobsRepository.find({
          where: {
            id: In(jobIds),
            userId,
          },
        })
      : [];
    const jobsById = new Map(jobs.map((job) => [job.id, job]));

    const analyses: AnalysisSample[] = assessments.map((assessment) => {
      const job = jobsById.get(assessment.jobId);
      const score = assessment.overallScore;
      return {
        score,
        createdAt: assessment.createdAt,
        jobTitle: job?.title?.trim() || 'General role',
        classification: classificationForScore(score),
      };
    });

    const clusters = new Map<string, ClusterAggregate>();
    const recentCutoff = analyses.slice(0, 3).map((analysis) => analysis.createdAt.getTime());
    const recentSet = new Set(recentCutoff);

    for (const analysis of analyses) {
      const cluster = resolveClusterLabel(analysis.jobTitle);
      const seniority = detectSeniority(analysis.jobTitle);
      const existing = clusters.get(cluster.key) ?? {
        key: cluster.key,
        label: cluster.label,
        scores: [],
        weightedScores: [],
        recencyHits: 0,
        analyses: 0,
        seniorityCounts: new Map<string, number>(),
      };

      existing.analyses += 1;
      existing.scores.push(analysis.score);
      existing.weightedScores.push(analysis.score * classificationWeight(analysis.classification));
      if (recentSet.has(analysis.createdAt.getTime())) {
        existing.recencyHits += 1;
      }
      if (seniority) {
        const current = existing.seniorityCounts.get(seniority) ?? 0;
        existing.seniorityCounts.set(seniority, current + 1);
      }

      clusters.set(cluster.key, existing);
    }

    const ranked = Array.from(clusters.values())
      .map((cluster) => {
        const weightedAverage = average(cluster.weightedScores);
        const frequencyBonus = Math.min(6, Math.max(0, cluster.analyses - 1) * 2);
        const recencyBonus = Math.min(3, cluster.recencyHits);
        const gravityScore = weightedAverage + frequencyBonus + recencyBonus;
        return {
          ...cluster,
          weightedAverage,
          frequencyBonus,
          recencyBonus,
          gravityScore,
        };
      })
      .sort((a, b) => b.gravityScore - a.gravityScore);

    const primary = ranked[0];
    if (!primary) {
      return { careerGravity: null };
    }

    const secondary = ranked[1] ?? null;
    const topSeniority = Array.from(primary.seniorityCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const confidence = this.resolveConfidence(analyses.length, primary, secondary);
    const summary = this.buildSummary({
      confidence,
      primaryLabel: primary.label,
      secondaryLabel: secondary?.label ?? null,
      seniorityTrend: topSeniority,
    });
    const supportingSignals = this.buildSupportingSignals({
      analysesCount: analyses.length,
      primary,
      seniorityTrend: topSeniority,
    });

    return {
      careerGravity: {
        summary,
        primaryRoleFamily: primary.label,
        secondaryRoleFamily: secondary?.label ?? null,
        seniorityTrend: topSeniority,
        confidence,
        supportingSignals,
      },
    };
  }

  private resolveConfidence(
    analysesCount: number,
    primary: {
      analyses: number;
      weightedAverage: number;
      gravityScore: number;
    },
    secondary: {
      gravityScore: number;
    } | null,
  ): ConfidenceLevel {
    const gravityGap = secondary ? primary.gravityScore - secondary.gravityScore : primary.gravityScore;

    if (analysesCount >= 4 && primary.analyses >= 3 && primary.weightedAverage >= 80 && gravityGap >= 5) {
      return 'High';
    }

    if (analysesCount >= 3 && primary.analyses >= 2 && primary.weightedAverage >= 70) {
      return 'Moderate';
    }

    return 'Low';
  }

  private buildSummary(input: {
    confidence: ConfidenceLevel;
    primaryLabel: string;
    secondaryLabel: string | null;
    seniorityTrend: string | null;
  }): string {
    const withSeniority = input.seniorityTrend
      ? `${input.seniorityTrend} level ${input.primaryLabel} roles`
      : `${input.primaryLabel} roles`;

    if (input.confidence === 'Low') {
      return `Your recent analyses suggest an emerging alignment toward ${withSeniority}, though additional analyses would strengthen this pattern.`;
    }

    if (input.secondaryLabel) {
      return `Your recent analyses show recurring compatibility in ${withSeniority}, with adjacent strength in ${input.secondaryLabel} paths.`;
    }

    return `Your strongest market alignment is trending toward ${withSeniority}.`;
  }

  private buildSupportingSignals(input: {
    analysesCount: number;
    primary: {
      scores: number[];
      analyses: number;
      recencyHits: number;
      weightedAverage: number;
    };
    seniorityTrend: string | null;
  }): string[] {
    const signals: string[] = [];
    const strongScores = input.primary.scores.filter((score) => score >= 80).length;
    if (strongScores >= 2) {
      signals.push(`Multiple recent analyses in this path scored above 80.`);
    } else if (input.primary.weightedAverage >= 75) {
      signals.push(`Average compatibility remains strongest in this role path.`);
    }

    if (input.seniorityTrend) {
      signals.push(`${input.seniorityTrend} level roles appear most frequently in your recent analyses.`);
    }

    if (input.primary.recencyHits >= 2) {
      signals.push(`Recent analyses continue to reinforce this alignment pattern.`);
    }

    if (!signals.length) {
      signals.push(`Pattern strength is based on ${input.primary.analyses} of your ${input.analysesCount} most recent analyses.`);
    }

    return signals.slice(0, 2);
  }
}
