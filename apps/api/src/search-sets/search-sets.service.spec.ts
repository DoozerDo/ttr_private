import { NotFoundException } from '@nestjs/common';
import {
  SearchSet,
  SearchSetSeniority,
  SearchSetWorkMode,
} from './search-set.entity';
import { SearchSetsService } from './search-sets.service';

describe('SearchSetsService', () => {
  const mockSearchSet: SearchSet = {
    id: 'set-1',
    userId: 'user-1',
    titlePatterns: ['Engineer'],
    seniority: SearchSetSeniority.ANY,
    industry: [],
    workMode: SearchSetWorkMode.ANY,
    sourceUrl: null,
    urlBacked: false,
    parseWarning: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockRepository = () => ({
    create: jest.fn((data: Partial<SearchSet>) => ({ ...mockSearchSet, ...data })),
    save: jest.fn(async (data: SearchSet) => data),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(async (data: SearchSet) => data),
  });

  const createService = (repository = createMockRepository()) =>
    new SearchSetsService(repository as never);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a search set with sanitized values', async () => {
    const repository = createMockRepository();
    const service = createService(repository);

    const result = await service.createSearchSet('user-1', {
      titlePatterns: ['  Senior Engineer  ', ''],
      industry: [' fintech '],
      sourceUrl: ' https://example.com ',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        titlePatterns: ['Senior Engineer'],
        industry: ['fintech'],
        sourceUrl: 'https://example.com',
        seniority: SearchSetSeniority.ANY,
        workMode: SearchSetWorkMode.ANY,
        urlBacked: false,
        parseWarning: null,
        isActive: true,
      }),
    );
    expect(result.titlePatterns).toEqual(['Senior Engineer']);
  });

  it('parses a LinkedIn search URL into filters', async () => {
    const repository = createMockRepository();
    const service = createService(repository);

    const result = await service.createSearchSet('user-1', {
      sourceUrl:
        'https://www.linkedin.com/jobs/search?keywords=Product%20Manager&f_E=4&f_WT=2',
    });

    expect(result.urlBacked).toBe(true);
    expect(result.titlePatterns).toEqual(['Product Manager']);
    expect(result.seniority).toBe(SearchSetSeniority.SENIOR);
    expect(result.workMode).toBe(SearchSetWorkMode.REMOTE);
    expect(result.parseWarning).toBeNull();
  });

  it('stores raw URL with warning when parsing yields no filters', async () => {
    const repository = createMockRepository();
    const service = createService(repository);

    const result = await service.createSearchSet('user-1', {
      sourceUrl: 'https://jobs.example.com/listings?page=2',
    });

    expect(result.urlBacked).toBe(true);
    expect(result.sourceUrl).toBe('https://jobs.example.com/listings?page=2');
    expect(result.titlePatterns).toEqual([]);
    expect(result.parseWarning).toContain('Stored URL');
  });

  it('lists search sets for a user', async () => {
    const repository = createMockRepository();
    repository.find.mockResolvedValue([mockSearchSet]);
    const service = createService(repository);

    const result = await service.listSearchSetsForUser('user-1');

    expect(repository.find).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      order: { createdAt: 'DESC' },
    });
    expect(result).toEqual([mockSearchSet]);
  });

  it('retrieves a search set for a user', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue(mockSearchSet);
    const service = createService(repository);

    const result = await service.getSearchSetForUser('set-1', 'user-1');

    expect(result).toEqual(mockSearchSet);
  });

  it('throws when search set is not found', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue(null);
    const service = createService(repository);

    await expect(service.getSearchSetForUser('missing', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates a search set', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue({ ...mockSearchSet });
    const service = createService(repository);

    const result = await service.updateSearchSet('set-1', 'user-1', {
      titlePatterns: ['Manager'],
      industry: ['security'],
      workMode: SearchSetWorkMode.REMOTE,
      isActive: false,
    });

    expect(result.titlePatterns).toEqual(['Manager']);
    expect(result.industry).toEqual(['security']);
    expect(result.workMode).toBe(SearchSetWorkMode.REMOTE);
    expect(result.isActive).toBe(false);
  });

  it('deletes a search set', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue(mockSearchSet);
    const service = createService(repository);

    const result = await service.deleteSearchSet('set-1', 'user-1');

    expect(repository.remove).toHaveBeenCalledWith(mockSearchSet);
    expect(result).toEqual({ deleted: true, id: 'set-1' });
  });
});
