import { ComplianceAction } from '../compliance/compliance.types';
import { ApplicationsService, CxFitScoreSnapshot } from './applications.service';
import {
  Application,
  ApplicationStage,
  ApplicationTrackerStatus,
} from './application.entity';

describe('ApplicationsService', () => {
  const baseDate = new Date('2025-01-01T00:00:00.000Z');
  const laterDate = new Date('2025-01-02T00:00:00.000Z');

  const mockApplication: Application = {
    id: 'app-1',
    userId: 'user-1',
    jobId: null,
    company: 'Acme Corp',
    title: 'Software Engineer',
    jobUrl: null,
    fingerprint: 'manual:existing',
    status: ApplicationTrackerStatus.PREPARED,
    preparedAt: baseDate,
    appliedAt: null,
    lastTouchedAt: laterDate,
    baselineVersionId: null,
    baselineId: null,
    analysisId: null,
    appliedDate: null,
    fitScore: null,
    stage: ApplicationStage.SAVED,
    notes: null,
    sourceUrl: null,
    cxFitScoreSnapshot: {},
    resumeArtifacts: [],
    verificationCoverageSnapshot: {},
    outcomeLinkageSnapshot: {},
    createdAt: baseDate,
    updatedAt: laterDate,
  };

  const createMockRepository = () => ({
    create: jest.fn((data: Partial<Application>) => ({
      ...mockApplication,
      ...data,
    })),
    save: jest.fn((app: Application) =>
      Promise.resolve({ ...app, id: app.id || 'new-id' }),
    ),
    findOne: jest.fn(),
    remove: jest.fn((app: Application) => Promise.resolve(app)),
    find: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockApplication]),
    })),
  });

  const createMockComplianceService = () => ({
    validateAndAudit: jest.fn().mockResolvedValue({
      complianceFlags: [],
      blocked: false,
      audit: {
        id: 'audit-id',
        outputHash: '',
        baselineVersionHash: 'hash-id',
        baselineVersionId: 'baseline-version',
        action: ComplianceAction.APPLICATION_EXPORT,
        actorId: 'user-1',
        jobId: null,
        createdAt: new Date().toISOString(),
      },
    }),
  });

  const createService = (
    repository = createMockRepository(),
    complianceService = createMockComplianceService(),
  ) => new ApplicationsService(repository as never, complianceService as never);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createApplication', () => {
    it('creates an application with required fields', async () => {
      const repository = createMockRepository();
      const service = createService(repository);

      const result = await service.createApplication('user-1', {
        company: 'Acme Corp',
        title: 'Software Engineer',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          jobId: null,
          company: 'Acme Corp',
          title: 'Software Engineer',
          jobUrl: null,
          fingerprint: expect.stringMatching(/^manual:/),
          status: ApplicationTrackerStatus.PREPARED,
          preparedAt: expect.any(Date),
          appliedAt: null,
          lastTouchedAt: expect.any(Date),
          baselineVersionId: null,
          baselineId: null,
          analysisId: null,
          fitScore: null,
          stage: ApplicationStage.SAVED,
          notes: null,
          sourceUrl: null,
          cxFitScoreSnapshot: {},
          resumeArtifacts: [],
          verificationCoverageSnapshot: {},
          outcomeLinkageSnapshot: {},
        }),
      );
      expect(repository.save).toHaveBeenCalled();
      expect(result.company).toBe('Acme Corp');
    });

    it('throws when company is missing', async () => {
      const service = createService();

      await expect(
        service.createApplication('user-1', { company: '', title: 'Engineer' }),
      ).rejects.toThrow('Company is required.');
    });

    it('throws when title is missing', async () => {
      const service = createService();

      await expect(
        service.createApplication('user-1', { company: 'Acme', title: '' }),
      ).rejects.toThrow('Title is required.');
    });
  });

  describe('listApplicationsForUser', () => {
    it('lists applications for user', async () => {
      const repository = createMockRepository();
      const service = createService(repository);

      const result = await service.listApplicationsForUser('user-1');

      expect(repository.createQueryBuilder).toHaveBeenCalledWith('application');
      expect(result).toHaveLength(1);
      expect(result[0].company).toBe('Acme Corp');
    });

    it('filters by stage', async () => {
      const repository = createMockRepository();
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockApplication]),
      };
      repository.createQueryBuilder.mockReturnValue(queryBuilder);
      const service = createService(repository);

      await service.listApplicationsForUser('user-1', {
        stage: ApplicationStage.APPLIED,
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'application.stage = :stage',
        { stage: ApplicationStage.APPLIED },
      );
    });

    it('filters by company', async () => {
      const repository = createMockRepository();
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockApplication]),
      };
      repository.createQueryBuilder.mockReturnValue(queryBuilder);
      const service = createService(repository);

      await service.listApplicationsForUser('user-1', { company: 'Acme' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'LOWER(application.company) LIKE LOWER(:company)',
        { company: '%Acme%' },
      );
    });

    it('orders by lastTouchedAt', async () => {
      const repository = createMockRepository();
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockApplication]),
      };
      repository.createQueryBuilder.mockReturnValue(queryBuilder);
      const service = createService(repository);

      await service.listApplicationsForUser('user-1');

      expect(queryBuilder.orderBy).toHaveBeenCalledWith(
        'application.lastTouchedAt',
        'DESC',
      );
    });
  });

  describe('getApplicationForUser', () => {
    it('returns application when found', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue(mockApplication);
      const service = createService(repository);

      const result = await service.getApplicationForUser('app-1', 'user-1');

      expect(result).toEqual(mockApplication);
    });

    it('throws when application not found', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue(null);
      const service = createService(repository);

      await expect(
        service.getApplicationForUser('app-1', 'user-1'),
      ).rejects.toThrow('Application not found');
    });

    it('enforces ownership', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue(null);
      const service = createService(repository);

      await expect(
        service.getApplicationForUser('app-1', 'other-user'),
      ).rejects.toThrow('Application not found');
    });
  });

  describe('updateApplication', () => {
    it('updates application fields', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue({ ...mockApplication });
      const service = createService(repository);

      const result = await service.updateApplication('app-1', 'user-1', {
        stage: ApplicationStage.INTERVIEWING,
        notes: 'Had phone screen',
      });

      expect(result.stage).toBe(ApplicationStage.INTERVIEWING);
      expect(result.notes).toBe('Had phone screen');
    });

    it('persists a stage-only change', async () => {
      const repository = createMockRepository();
      const existing = {
        ...mockApplication,
        stage: ApplicationStage.SCREENING,
      };
      repository.findOne.mockResolvedValue(existing);
      const service = createService(repository);

      const result = await service.updateApplication('app-1', 'user-1', {
        stage: ApplicationStage.OFFER,
      });

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'app-1',
          stage: ApplicationStage.OFFER,
          company: existing.company,
          title: existing.title,
        }),
      );
      expect(result.stage).toBe(ApplicationStage.OFFER);
    });
  });

  describe('deleteApplication', () => {
    it('deletes application', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue(mockApplication);
      const service = createService(repository);

      const result = await service.deleteApplication('app-1', 'user-1');

      expect(repository.remove).toHaveBeenCalled();
      expect(result).toEqual({ deleted: true, id: 'app-1' });
    });
  });

  describe('exportApplicationsToCsv', () => {
    it('exports applications and audits compliance', async () => {
      const repository = createMockRepository();
      const complianceService = createMockComplianceService();

      repository.find.mockResolvedValue([
        {
          ...mockApplication,
          appliedDate: new Date('2024-01-01T00:00:00.000Z'),
          fitScore: 80,
          notes: 'Followed up',
          sourceUrl: 'https://example.com',
        },
      ]);

      const service = createService(repository, complianceService);

      const result = await service.exportApplicationsToCsv('user-1');

      expect(repository.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { lastTouchedAt: 'DESC' },
      });
      expect(result.csv).toContain(
        'company,title,appliedDate,fitScore,stage,notes,sourceUrl',
      );
      expect(result.csv).toContain(
        'Acme Corp,Software Engineer,2024-01-01T00:00:00.000Z,80,SAVED,Followed up,https://example.com',
      );
      expect(result.auditId).toBe('audit-id');
      expect(result.baselineVersionHash).toBe('hash-id');
      expect(complianceService.validateAndAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: ComplianceAction.APPLICATION_EXPORT,
          actorId: 'user-1',
          outputHash: expect.any(String),
        }),
      );
    });
  });

  describe('upsertPreparedFromResumeGeneration', () => {
    it('creates a prepared entry when none exists', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue(null);
      const service = createService(repository);
      const snapshot: CxFitScoreSnapshot = {
        overallScore: 92,
        verdict: 'APPLY',
        dimensionScores: { key: 1 },
        createdAt: new Date().toISOString(),
      };

      await service.upsertPreparedFromResumeGeneration({
        userId: 'user-1',
        jobId: 'job-1',
        companyName: 'Acme Corp',
        roleTitle: 'Engineer',
        baselineVersionId: 'baseline-v1',
        cxFitScoreSnapshot: snapshot,
        resumeArtifactId: 'artifact-1',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          jobId: 'job-1',
          company: 'Acme Corp',
          title: 'Engineer',
          fingerprint: expect.stringContaining('job:'),
          status: ApplicationTrackerStatus.READY,
          baselineVersionId: 'baseline-v1',
          baselineId: null,
          analysisId: null,
          fitScore: snapshot.overallScore,
          sourceUrl: null,
        }),
      );
      expect(repository.save).toHaveBeenCalled();
    });

    it('stores verification snapshot and linkage details', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue(null);
      const service = createService(repository);

      await service.upsertPreparedFromResumeGeneration({
        userId: 'user-1',
        jobId: 'job-1',
        companyName: 'Acme Corp',
        roleTitle: 'Engineer',
        baselineVersionId: 'baseline-v1',
        baselineId: 'baseline-1',
        analysisId: 'analysis-1',
        verificationCoverageSnapshot: {
          verifiedRequirements: ['Salesforce'],
          inferredRequirements: ['Service Cloud'],
          unverifiedRequirements: ['Zendesk'],
        },
        outcomeLinkageSnapshot: {
          removedTargeting: ['Five9'],
          addedEvidence: ['Zendesk'],
          evidenceAdded: true,
        },
        resumeArtifactId: 'artifact-1',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          analysisId: 'analysis-1',
          baselineId: 'baseline-1',
          verificationCoverageSnapshot: expect.objectContaining({
            unverifiedRequirements: ['Zendesk'],
          }),
          outcomeLinkageSnapshot: expect.objectContaining({
            addedEvidence: ['Zendesk'],
          }),
        }),
      );
    });

    it('dedupes and appends artifacts for prepared entries', async () => {
      const repository = createMockRepository();
      const existing = {
        ...mockApplication,
        fingerprint: 'job:job-1',
        resumeArtifacts: [
          {
            resumeArtifactId: 'artifact-1',
            type: 'resume',
            createdAt: baseDate.toISOString(),
          },
        ],
      };
      repository.findOne.mockResolvedValue(existing);
      const service = createService(repository);

      await service.upsertPreparedFromResumeGeneration({
        userId: 'user-1',
        jobId: 'job-1',
        companyName: 'Acme Corp',
        roleTitle: 'Engineer',
        baselineVersionId: 'baseline-v1',
        resumeArtifactId: 'artifact-2',
      });

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          resumeArtifacts: expect.arrayContaining([
            expect.objectContaining({ resumeArtifactId: 'artifact-1' }),
            expect.objectContaining({ resumeArtifactId: 'artifact-2' }),
          ]),
        }),
      );
    });

    it('keeps applied entries applied and retains snapshot', async () => {
      const repository = createMockRepository();
      const existing = {
        ...mockApplication,
        fingerprint: 'job:job-1',
        status: ApplicationTrackerStatus.APPLIED,
        cxFitScoreSnapshot: { overallScore: 50, verdict: 'CONSIDER', dimensionScores: {}, createdAt: baseDate.toISOString() },
      };
      repository.findOne.mockResolvedValue(existing);
      const service = createService(repository);
      const snapshot: CxFitScoreSnapshot = {
        overallScore: 91,
        verdict: 'APPLY',
        dimensionScores: {},
        createdAt: new Date().toISOString(),
      };

      await service.upsertPreparedFromResumeGeneration({
        userId: 'user-1',
        jobId: 'job-1',
        companyName: 'Acme Corp',
        roleTitle: 'Engineer',
        baselineVersionId: 'baseline-v1',
        cxFitScoreSnapshot: snapshot,
        resumeArtifactId: 'artifact-3',
      });

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ApplicationTrackerStatus.APPLIED,
          cxFitScoreSnapshot: existing.cxFitScoreSnapshot,
        }),
      );
    });

    it('falls back to fingerprint hash when jobId is missing', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue(null);
      const service = createService(repository);
      const computed = (service as any).computeFingerprint({
        userId: 'user-1',
        companyName: 'Acme',
        roleTitle: 'Engineer',
        jobUrl: 'https://example.com',
        baselineVersionId: 'baseline-v1',
        resumeArtifactId: 'artifact-4',
      });

      await service.upsertPreparedFromResumeGeneration({
        userId: 'user-1',
        companyName: 'Acme',
        roleTitle: 'Engineer',
        jobUrl: 'https://example.com',
        baselineVersionId: 'baseline-v1',
        resumeArtifactId: 'artifact-4',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fingerprint: computed,
        }),
      );
    });
  });

  describe('pair application tracking', () => {
    it('hydrates an application for a baseline and job pair', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue(mockApplication);
      const service = createService(repository);

      const result = await service.getApplicationForPair('user-1', 'base-1', 'job-1');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          baselineId: 'base-1',
          jobId: 'job-1',
        },
      });
      expect(result).toEqual(mockApplication);
    });

    it('upserts a ready pair application without duplicating applied state', async () => {
      const repository = createMockRepository();
      const existing = {
        ...mockApplication,
        fingerprint: 'pair:base-1:job-1',
        baselineId: 'base-1',
        jobId: 'job-1',
        status: ApplicationTrackerStatus.APPLIED,
        appliedAt: baseDate,
      };
      repository.findOne.mockResolvedValue(existing);
      const service = createService(repository);

      const result = await service.upsertApplicationForPair({
        userId: 'user-1',
        baselineId: 'base-1',
        jobId: 'job-1',
        companyName: 'Acme Corp',
        roleTitle: 'Engineer',
        applicationStatus: ApplicationTrackerStatus.READY,
        fitScore: 92,
        resumeArtifactId: 'artifact-1',
        resumeArtifactType: 'cover',
      });

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ApplicationTrackerStatus.APPLIED,
          appliedAt: baseDate,
          resumeArtifacts: expect.arrayContaining([
            expect.objectContaining({
              resumeArtifactId: 'artifact-1',
              type: 'cover',
            }),
          ]),
        }),
      );
      expect(result.status).toBe(ApplicationTrackerStatus.APPLIED);
    });

    it('creates a ready pair application when none exists', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue(null);
      const service = createService(repository);

      await service.upsertApplicationForPair({
        userId: 'user-1',
        baselineId: 'base-1',
        jobId: 'job-1',
        companyName: 'Acme Corp',
        roleTitle: 'Engineer',
        applicationStatus: ApplicationTrackerStatus.READY,
        fitScore: 91,
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fingerprint: 'pair:base-1:job-1',
          status: ApplicationTrackerStatus.READY,
          baselineId: 'base-1',
          jobId: 'job-1',
        }),
      );
    });
  });

  describe('buildInsightsForUser', () => {
    it('returns actionable insights from historical outcomes', async () => {
      const repository = createMockRepository();
      repository.find.mockResolvedValue([
        {
          ...mockApplication,
          id: 'app-a',
          stage: ApplicationStage.REJECTED,
          verificationCoverageSnapshot: { unverifiedRequirements: ['Zendesk'] },
        },
        {
          ...mockApplication,
          id: 'app-b',
          stage: ApplicationStage.NO_RESPONSE,
          verificationCoverageSnapshot: { unverifiedRequirements: ['Zendesk'] },
        },
        {
          ...mockApplication,
          id: 'app-c',
          stage: ApplicationStage.INTERVIEWING,
          verificationCoverageSnapshot: { unverifiedRequirements: [] },
        },
      ]);
      const service = createService(repository);

      const insights = await service.buildInsightsForUser('user-1');

      expect(insights.some((insight) => insight.message.includes('Zendesk'))).toBe(true);
      expect(
        insights.some((insight) =>
          insight.message.includes('all core requirements were verified'),
        ),
      ).toBe(true);
    });
  });
});
