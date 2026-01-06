import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceService } from '../compliance/compliance.service';
import { FitAssessment } from '../analysis/fit-assessment.entity';
import { Job } from '../jobs/job.entity';
import { StarStory } from '../star-stories/star-story.entity';
import { InterviewQuestionGeneratorService } from './interview-question-generator.service';
import { InterviewToolkitService } from './interview-toolkit.service';
import { BaselineVersion } from '../baseline/baseline-version.entity';
import { Baseline } from '../baseline/baseline.entity';

const buildRepository = <T>(overrides: Partial<Repository<T>> = {}): Partial<Repository<T>> => ({
  findOne: jest.fn(),
  find: jest.fn(),
  ...overrides,
});

describe('InterviewToolkitService', () => {
  let service: InterviewToolkitService;
  let jobRepository: Partial<Repository<Job>>;
  let fitAssessmentRepository: Partial<Repository<FitAssessment>>;
  let starStoryRepository: Partial<Repository<StarStory>>;
  let questionGenerator: Partial<InterviewQuestionGeneratorService>;
  let baselineVersionRepository: Partial<Repository<BaselineVersion>>;

  beforeEach(async () => {
    jobRepository = buildRepository();
    fitAssessmentRepository = buildRepository();
    starStoryRepository = buildRepository();
    baselineVersionRepository = buildRepository();
    questionGenerator = {
      generateQuestions: jest.fn().mockReturnValue([{ gapId: 'gap-1', prompt: 'Q1', category: 'Context', jdReference: '' }]),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        InterviewToolkitService,
        { provide: getRepositoryToken(Job), useValue: jobRepository },
        { provide: getRepositoryToken(FitAssessment), useValue: fitAssessmentRepository },
        { provide: getRepositoryToken(StarStory), useValue: starStoryRepository },
        { provide: getRepositoryToken(BaselineVersion), useValue: baselineVersionRepository },
        { provide: getRepositoryToken(Baseline), useValue: buildRepository() },
        { provide: InterviewQuestionGeneratorService, useValue: questionGenerator },
        {
          provide: ComplianceService,
          useValue: {
            validateAndAudit: jest.fn().mockResolvedValue({ blocked: false, complianceFlags: [] }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(InterviewToolkitService);
  });

  it('builds a study packet from latest assessment and stories', async () => {
    const job: Job = {
      id: 'job-1',
      userId: 'user-1',
      title: 'Senior Engineer',
      company: 'TestCo',
      rawDescription: 'Line one',
      sourceUrl: null,
      normalizedResponsibilities: ['Lead systems', 'Coach team'],
      normalizedRequirements: [],
      jdIngestionMethod: 'PASTE' as any,
      jdParsedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const assessment: FitAssessment = {
      id: 'fit-1',
      userId: 'user-1',
      jobId: 'job-1',
      baselineId: 'baseline-1',
      baselineVersion: 1,
      overallScore: 92,
      verdict: 'APPLY',
      dimensionScores: {
        experienceAlignment: 1,
        leadershipLevel: 1,
        technicalPlatformFit: 1,
        industryContext: 1,
        strategicTacticalFit: 1,
      },
      strengths: ['impact'],
      gaps: ['systems design'],
      complianceFlags: [],
      inputsHash: null,
      createdAt: new Date(),
    } as any;

    (jobRepository.findOne as jest.Mock).mockResolvedValue(job);
    (fitAssessmentRepository.findOne as jest.Mock).mockResolvedValue(assessment);
    (starStoryRepository.find as jest.Mock).mockResolvedValue([
      {
        id: 'story-1',
        title: 'Scaling project',
        situation: '',
        task: '',
        action: '',
        result: '',
        reflections: null,
        competencies: ['systems'],
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ]);

    const packet = await service.buildStudyPacket('user-1', 'job-1');

    expect(packet.job).toEqual({ id: 'job-1', title: 'Senior Engineer', company: 'TestCo' });
    expect(packet.fitSnapshot?.overallScore).toBe(92);
    expect(packet.recommendedStories).toHaveLength(1);
    expect(packet.questions).toHaveLength(1);
  });

  it('generates follow up copy through compliance', async () => {
    const job: Job = {
      id: 'job-2',
      userId: 'user-1',
      title: 'PM',
      company: 'Acme',
      rawDescription: 'JD',
      sourceUrl: null,
      normalizedResponsibilities: [],
      normalizedRequirements: [],
      jdIngestionMethod: 'PASTE' as any,
      jdParsedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (jobRepository.findOne as jest.Mock).mockResolvedValue(job);

    (baselineVersionRepository.findOne as jest.Mock).mockResolvedValue({
      id: 'bv-1',
      hash: 'hash-1',
      baseline: { id: 'baseline-1', userId: 'user-1' } as Baseline,
    });

    const result = await service.generateFollowUp('user-1', 'job-2', 'bv-1', 'roadmap planning');

    expect(result.content).toContain('roadmap planning');
    expect(result.job).toEqual({ id: 'job-2', title: 'PM', company: 'Acme' });
  });

  it('requires a baseline version id for follow ups', async () => {
    const job: Job = {
      id: 'job-2',
      userId: 'user-1',
      title: 'PM',
      company: 'Acme',
      rawDescription: 'JD',
      sourceUrl: null,
      normalizedResponsibilities: [],
      normalizedRequirements: [],
      jdIngestionMethod: 'PASTE' as any,
      jdParsedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (jobRepository.findOne as jest.Mock).mockResolvedValue(job);
    (baselineVersionRepository.findOne as jest.Mock).mockResolvedValue({
      id: 'bv-1',
      hash: 'hash-1',
      baseline: { id: 'baseline-1', userId: 'user-1' } as Baseline,
    });

    await expect(service.generateFollowUp('user-1', 'job-2', '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
