import { AccessCodesService } from './access-codes.service';

describe('AccessCodesService resolveBetaAccessApproved', () => {
  it('returns true when user flag is already approved', async () => {
    const service = new AccessCodesService({} as any, {} as any);
    const spy = jest.spyOn(service, 'userHasActiveAccess').mockResolvedValue(false);

    await expect(
      service.resolveBetaAccessApproved({ userId: 'user-1', betaAccessApproved: true }),
    ).resolves.toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('falls back to active access code when user flag is false', async () => {
    const service = new AccessCodesService({} as any, {} as any);
    jest.spyOn(service, 'userHasActiveAccess').mockResolvedValue(true);

    await expect(
      service.resolveBetaAccessApproved({ userId: 'user-1', betaAccessApproved: false }),
    ).resolves.toBe(true);
  });

  it('returns false when no active access code exists', async () => {
    const service = new AccessCodesService({} as any, {} as any);
    jest.spyOn(service, 'userHasActiveAccess').mockResolvedValue(false);

    await expect(
      service.resolveBetaAccessApproved({ userId: 'user-1', betaAccessApproved: false }),
    ).resolves.toBe(false);
  });
});

describe('AccessCodesService assigned access helpers', () => {
  it('returns false when user id is empty', async () => {
    const service = new AccessCodesService({} as any, {} as any);
    await expect(service.countAssignedUnredeemedAccessCodes('')).resolves.toBe(0);
    await expect(service.userHasAssignedUnredeemedAccessCode('')).resolves.toBe(false);
  });

  it('counts assigned unredeemed codes via repository query', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(2),
    };
    const repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const service = new AccessCodesService(repo as any, {} as any);

    await expect(service.countAssignedUnredeemedAccessCodes('u1')).resolves.toBe(2);
    await expect(service.userHasAssignedUnredeemedAccessCode('u1')).resolves.toBe(true);
  });
});
