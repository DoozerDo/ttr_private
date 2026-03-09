import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Job } from '../../jobs/job.entity';
import { FitAssessment } from '../fit-assessment.entity';

type RecentAnalysisDto = {
  analysisId: string;
  jobTitle: string;
  company: string;
  score: number;
  classification: string;
  createdAt: string;
};

type AlignmentPatternDto = {
  strongestAlignmentRoles: string[];
  totalAnalyses: number;
  averageScore: number;
};

type AchievementBadgeDto = {
  id: string;
  title: string;
  description: string;
};

type AlignmentHistoryDto = {
  recentAnalyses: RecentAnalysisDto[];
  alignmentPattern: AlignmentPatternDto;
  badges: AchievementBadgeDto[];
};

type RoleClusterRule = {
  key: string;
  label: string;
  requiredKeywords: string[];
};

type ClusterAggregate = {
  key: string;
  label: string;
  scores: number[];
  roles: string[];
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

function toClassification(score: number): string {
  if (score >= 95) return 'Elite Match';
  if (score >= 85) return 'Top Tier Candidate';
  if (score >= 70) return 'Competitive Alignment';
  if (score >= 50) return 'Developing Fit';
  return 'Misaligned Role';
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

function titleCase(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
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

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

@Injectable()
export class AlignmentHistoryService {
  constructor(
    @InjectRepository(FitAssessment)
    private readonly fitAssessmentsRepository: Repository<FitAssessment>,
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
  ) {}

  async getAlignmentHistory(userId: string): Promise<AlignmentHistoryDto> {
    const recentAssessments = await this.fitAssessmentsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const totalAnalyses = await this.fitAssessmentsRepository.count({
      where: { userId },
    });

    const jobIds = Array.from(new Set(recentAssessments.map((assessment) => assessment.jobId)));
    const jobs = jobIds.length
      ? await this.jobsRepository.find({
          where: {
            id: In(jobIds),
            userId,
          },
        })
      : [];
    const jobsById = new Map(jobs.map((job) => [job.id, job]));

    const recentAnalyses: RecentAnalysisDto[] = recentAssessments.map((assessment) => {
      const job = jobsById.get(assessment.jobId);
      const score = assessment.overallScore;
      return {
        analysisId: assessment.id,
        jobTitle: job?.title?.trim() || 'Untitled role',
        company: job?.company?.trim() || 'Unknown company',
        score,
        classification: toClassification(score),
        createdAt: assessment.createdAt.toISOString(),
      };
    });

    const averageScore =
      recentAnalyses.length > 0 ? Number(average(recentAnalyses.map((item) => item.score)).toFixed(1)) : 0;

    const clusterMap = new Map<string, ClusterAggregate>();
    for (const analysis of recentAnalyses) {
      const cluster = resolveClusterLabel(analysis.jobTitle);
      const existing = clusterMap.get(cluster.key) ?? {
        key: cluster.key,
        label: cluster.label,
        scores: [],
        roles: [],
      };
      existing.scores.push(analysis.score);
      existing.roles.push(analysis.jobTitle);
      clusterMap.set(cluster.key, existing);
    }

    const allClusters = Array.from(clusterMap.values());
    const multiAnalysisClusters = allClusters.filter((cluster) => cluster.scores.length >= 2);

    const rankedMultiClusters = [...multiAnalysisClusters].sort((a, b) => {
      const avgDiff = average(b.scores) - average(a.scores);
      if (avgDiff !== 0) return avgDiff;
      return b.scores.length - a.scores.length;
    });

    const rankedAllClusters = [...allClusters].sort((a, b) => {
      const avgDiff = average(b.scores) - average(a.scores);
      if (avgDiff !== 0) return avgDiff;
      return b.scores.length - a.scores.length;
    });

    const strongestCluster =
      rankedMultiClusters[0] ??
      rankedAllClusters.find((cluster) => Math.max(...cluster.scores) >= 80) ??
      rankedAllClusters[0];

    const strongestAlignmentRoles = strongestCluster
      ? Array.from(new Set(strongestCluster.roles)).slice(0, 3)
      : [];

    const badges: AchievementBadgeDto[] = [];

    if (recentAnalyses.some((analysis) => analysis.score >= 90)) {
      badges.push({
        id: 'top-tier-candidate',
        title: 'Top Tier Candidate',
        description: 'Achieved a compatibility score above 90',
      });
    }

    if (totalAnalyses >= 3) {
      badges.push({
        id: 'career-explorer',
        title: 'Career Explorer',
        description: 'Completed three or more role compatibility analyses',
      });
    }

    const hasStrongPattern = allClusters.some((cluster) => {
      return cluster.scores.length >= 3 && average(cluster.scores) >= 80;
    });

    if (hasStrongPattern) {
      badges.push({
        id: 'strong-alignment-pattern',
        title: 'Strong Alignment Pattern',
        description: 'Multiple analyses show strong compatibility within the same career path',
      });
    }

    return {
      recentAnalyses,
      alignmentPattern: {
        strongestAlignmentRoles,
        totalAnalyses,
        averageScore,
      },
      badges,
    };
  }
}
