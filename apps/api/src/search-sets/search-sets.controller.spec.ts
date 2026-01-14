import { BadRequestException } from '@nestjs/common';
import { SearchSetWorkMode } from './search-set.entity';
import { SearchSetsController } from './search-sets.controller';
import { SearchSetsRunnerService } from './search-sets-runner.service';
import { SearchSetsService } from './search-sets.service';

describe('SearchSetsController', () => {
  const createController = () => {
    const searchSetsService = {
      createSearchSet: jest.fn(),
      listSearchSetsForUser: jest.fn(),
      getSearchSetForUser: jest.fn(),
      updateSearchSet: jest.fn(),
      deleteSearchSet: jest.fn(),
      parseSearchSetUrl: jest.fn(),
    } as unknown as jest.Mocked<SearchSetsService>;

    const runnerService = {
      runSearchSet: jest.fn(),
    } as unknown as jest.Mocked<SearchSetsRunnerService>;

    const controller = new SearchSetsController(searchSetsService, runnerService);

    return { controller, searchSetsService, runnerService };
  };

  const mockRequest = (userId?: string) => ({ user: { id: userId } }) as any;

  it('creates a search set', async () => {
    const { controller, searchSetsService } = createController();
    const body = { titlePatterns: ['Engineer'] };
    searchSetsService.createSearchSet.mockResolvedValue({ id: 'set-1' } as any);

    const result = await controller.createSearchSet(body, mockRequest('user-1'));

    expect(searchSetsService.createSearchSet).toHaveBeenCalledWith('user-1', body);
    expect(result).toEqual({ id: 'set-1' });
  });

  it('lists search sets', async () => {
    const { controller, searchSetsService } = createController();
    searchSetsService.listSearchSetsForUser.mockResolvedValue([{ id: 'set-1' }] as any);

    const result = await controller.listSearchSets(mockRequest('user-1'));

    expect(searchSetsService.listSearchSetsForUser).toHaveBeenCalledWith('user-1');
    expect(result).toEqual([{ id: 'set-1' }]);
  });

  it('gets a search set', async () => {
    const { controller, searchSetsService } = createController();
    searchSetsService.getSearchSetForUser.mockResolvedValue({ id: 'set-1' } as any);

    const result = await controller.getSearchSet('set-1', mockRequest('user-1'));

    expect(searchSetsService.getSearchSetForUser).toHaveBeenCalledWith('set-1', 'user-1');
    expect(result).toEqual({ id: 'set-1' });
  });

  it('updates a search set', async () => {
    const { controller, searchSetsService } = createController();
    searchSetsService.updateSearchSet.mockResolvedValue({ id: 'set-1' } as any);

    const result = await controller.updateSearchSet(
      'set-1',
      { workMode: SearchSetWorkMode.REMOTE },
      mockRequest('user-1'),
    );

    expect(searchSetsService.updateSearchSet).toHaveBeenCalledWith(
      'set-1',
      'user-1',
      { workMode: SearchSetWorkMode.REMOTE },
    );
    expect(result).toEqual({ id: 'set-1' });
  });

  it('deletes a search set', async () => {
    const { controller, searchSetsService } = createController();
    searchSetsService.deleteSearchSet.mockResolvedValue({ deleted: true, id: 'set-1' } as any);

    const result = await controller.deleteSearchSet('set-1', mockRequest('user-1'));

    expect(searchSetsService.deleteSearchSet).toHaveBeenCalledWith('set-1', 'user-1');
    expect(result).toEqual({ deleted: true, id: 'set-1' });
  });

  it('runs a search set', async () => {
    const { controller, runnerService } = createController();
    const runResponse = {
      results: [{ jobId: 'job-1' }],
      metadata: {
        usedProviderDiscovery: false,
        providerId: null,
        sourceSnapshot: null,
        runInputHash: null,
      },
    };
    runnerService.runSearchSet.mockResolvedValue(runResponse as any);

    const result = await controller.runSearchSet(
      'set-1',
      { limit: 5, baselineVersionId: 'baseline-version-1' },
      mockRequest('user-1'),
    );

    expect(runnerService.runSearchSet).toHaveBeenCalledWith(
      'set-1',
      'user-1',
      'baseline-version-1',
      5,
    );
    expect(result).toEqual(runResponse);
  });

  it('throws when baselineVersionId is missing', async () => {
    const { controller } = createController();

    await expect(
      controller.runSearchSet('set-1', { limit: 5 }, mockRequest('user-1')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('parses a job board URL', async () => {
    const { controller, searchSetsService } = createController();
    searchSetsService.parseSearchSetUrl.mockResolvedValue({ titlePatterns: ['a'] });

    const result = await controller.parseSearchSetUrl(
      { url: ' https://example.com ' },
      mockRequest('user-1'),
    );

    expect(searchSetsService.parseSearchSetUrl).toHaveBeenCalledWith('https://example.com');
    expect(result).toEqual({ titlePatterns: ['a'] });
  });

  it('throws when user context is missing', async () => {
    const { controller } = createController();

    await expect(
      controller.createSearchSet({ titlePatterns: [] }, mockRequest(undefined)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
