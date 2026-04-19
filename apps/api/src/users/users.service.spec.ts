import { UsersService } from './users.service';
import { Logger } from '@nestjs/common';

describe('UsersService betaAccessApproved backwards compatibility', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('falls back when betaAccessApproved column is missing', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined as any);

    const findOne = jest
      .fn()
      .mockRejectedValueOnce(
        new Error('column "users"."betaAccessApproved" does not exist'),
      );

    const qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: 'hash',
        subscriptionTier: 'FREE',
      }),
    };

    const repo: any = {
      findOne,
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    const service = new UsersService(repo);
    const user = await service.findByEmail('user@example.com');

    expect(user).toBeTruthy();
    expect((user as any).betaAccessApproved).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('missing users.betaAccessApproved');
    expect(repo.createQueryBuilder).toHaveBeenCalledWith('user');
    expect(qb.getOne).toHaveBeenCalled();
  });

  it('logs the schema drift warning only once per service instance', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined as any);

    const error = new Error('column "users"."betaAccessApproved" does not exist');
    const repo: any = {
      findOne: jest.fn().mockRejectedValue(error),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.com',
          passwordHash: 'hash',
          subscriptionTier: 'FREE',
        }),
      }),
    };

    const service = new UsersService(repo);
    await service.findByEmail('user@example.com');
    await service.findById('user-1');

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('rethrows errors that are not missing betaAccessApproved column', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined as any);

    const findOne = jest.fn().mockRejectedValueOnce(new Error('db down'));
    const repo: any = {
      findOne,
      createQueryBuilder: jest.fn(),
    };

    const service = new UsersService(repo);

    await expect(service.findByEmail('user@example.com')).rejects.toThrow(
      'db down',
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
