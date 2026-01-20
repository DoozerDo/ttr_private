import { ApplicationsService } from './applications.service';
import { ComplianceAction } from '../compliance/compliance.types';
import { Application, ApplicationStage } from './application.entity';

describe('ApplicationsService', () => {
  const mockApplication: Application = {
    id: 'app-1',
    userId: 'user-1',
    jobId: null,
    company: 'Acme Corp',
    title: 'Software Engineer',
    appliedDate: null,
    fitScore: null,
    stage: ApplicationStage.SAVED,
    notes: null,
    sourceUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockRepository = () => ({
    create: jest.fn((data: Partial<Application>) => ({ ...mockApplication, ...data })),
    save: jest.fn((app: Application) => Promise.resolve({ ...app, id: app.id || 'new-id' })),
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

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        jobId: null,
        company: 'Acme Corp',
        title: 'Software Engineer',
        appliedDate: null,
        fitScore: null,
        stage: ApplicationStage.SAVED,
        notes: null,
        sourceUrl: null,
      });
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
      const queryBuilder = repository.createQueryBuilder();
      const service = createService(repository);

      await service.listApplicationsForUser('user-1', { stage: ApplicationStage.APPLIED });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'application.stage = :stage',
        { stage: ApplicationStage.APPLIED },
      );
    });

    it('filters by company', async () => {
      const repository = createMockRepository();
      const queryBuilder = repository.createQueryBuilder();
      const service = createService(repository);

      await service.listApplicationsForUser('user-1', { company: 'Acme' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'LOWER(application.company) LIKE LOWER(:company)',
        { company: '%Acme%' },
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

      await expect(service.getApplicationForUser('app-1', 'user-1')).rejects.toThrow(
        'Application not found',
      );
    });

    it('enforces ownership', async () => {
      const repository = createMockRepository();
      repository.findOne.mockResolvedValue(null);
      const service = createService(repository);

      await expect(service.getApplicationForUser('app-1', 'other-user')).rejects.toThrow(
        'Application not found',
      );
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
      const existing = { ...mockApplication, stage: ApplicationStage.SCREENING };
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
        order: { createdAt: 'DESC' },
      });
      expect(result.csv).toContain('company,title,appliedDate,fitScore,stage,notes,sourceUrl');
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
});
