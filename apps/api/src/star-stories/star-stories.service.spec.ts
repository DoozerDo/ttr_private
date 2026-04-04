import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StarStory } from './star-story.entity';
import { StarStoriesService } from './star-stories.service';

describe('StarStoriesService', () => {
  const mockStory: StarStory = {
    id: 'story-1',
    userId: 'user-1',
    title: 'Launch project',
    situation: 'System reliability was poor',
    task: 'Improve uptime',
    action: 'Led migration to HA setup',
    result: '99.9% uptime achieved',
    reflections: 'Need earlier monitoring',
    competencies: ['leadership'],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  };

  const createMockRepository = () => ({
    create: jest.fn((data: Partial<StarStory>) => ({ ...mockStory, ...data })),
    save: jest.fn((data: StarStory) => Promise.resolve(data)),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn((data: StarStory) => Promise.resolve(data)),
  });

  const createService = (repository = createMockRepository()) =>
    new StarStoriesService(repository as never);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a STAR story with required fields', async () => {
    const repository = createMockRepository();
    const service = createService(repository);

    const result = await service.createStarStory('user-1', {
      title: ' Reliability fix ',
      situation: ' Outages ',
      task: ' Stabilize ',
      action: ' Added alerts ',
      result: ' Reduced incidents ',
      competencies: [' ops '],
      reflections: '  More runbooks  ',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        title: 'Reliability fix',
        situation: 'Outages',
        task: 'Stabilize',
        action: 'Added alerts',
        result: 'Reduced incidents',
        reflections: 'More runbooks',
        competencies: ['ops'],
      }),
    );
    expect(result.title).toBe('Reliability fix');
  });

  it('lists stories for a user', async () => {
    const repository = createMockRepository();
    repository.find.mockResolvedValue([mockStory]);
    const service = createService(repository);

    const stories = await service.listStarStoriesForUser('user-1');

    expect(repository.find).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      order: { createdAt: 'DESC' },
    });
    expect(stories).toEqual([mockStory]);
  });

  it('retrieves a story for a user', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue(mockStory);
    const service = createService(repository);

    const story = await service.getStarStoryForUser('story-1', 'user-1');

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'story-1', userId: 'user-1' },
    });
    expect(story).toEqual(mockStory);
  });

  it('throws when story not found', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue(null);
    const service = createService(repository);

    await expect(
      service.getStarStoryForUser('missing', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates a story with validation', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue({ ...mockStory });
    const service = createService(repository);

    const result = await service.updateStarStory('story-1', 'user-1', {
      title: ' Updated ',
      result: ' Better outcomes ',
      competencies: [' leadership ', ''],
      reflections: null,
    });

    expect(repository.save).toHaveBeenCalled();
    expect(result.title).toBe('Updated');
    expect(result.result).toBe('Better outcomes');
    expect(result.competencies).toEqual(['leadership']);
    expect(result.reflections).toBeNull();
  });

  it('throws when updating with empty required field', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue({ ...mockStory });
    const service = createService(repository);

    await expect(
      service.updateStarStory('story-1', 'user-1', { title: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes a story', async () => {
    const repository = createMockRepository();
    repository.findOne.mockResolvedValue(mockStory);
    const service = createService(repository);

    const result = await service.deleteStarStory('story-1', 'user-1');

    expect(repository.remove).toHaveBeenCalledWith(mockStory);
    expect(result).toEqual({ deleted: true, id: 'story-1' });
  });
});
