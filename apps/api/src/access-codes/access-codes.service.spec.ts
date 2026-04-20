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

