import { assertUsersBetaAccessApprovedColumnCompatible } from './schema-compatibility';

describe('schema compatibility gate', () => {
  it('fails closed when users.betaAccessApproved is missing and override is not set', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      assertUsersBetaAccessApprovedColumnCompatible({
        dataSource: { query: jest.fn().mockResolvedValue([]) } as any,
        config: { get: jest.fn().mockReturnValue(undefined) } as any,
        logger: console,
      }),
    ).rejects.toThrow('missing users.betaAccessApproved');

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('allows startup when override is set (temporary bridge)', async () => {
    await expect(
      assertUsersBetaAccessApprovedColumnCompatible({
        dataSource: { query: jest.fn().mockResolvedValue([]) } as any,
        config: { get: jest.fn().mockReturnValue('true') } as any,
        logger: { log: jest.fn(), error: jest.fn() } as any,
      }),
    ).resolves.toBeUndefined();
  });

  it('passes when users.betaAccessApproved exists', async () => {
    await expect(
      assertUsersBetaAccessApprovedColumnCompatible({
        dataSource: {
          query: jest.fn().mockResolvedValue([{ column_name: 'betaAccessApproved' }]),
        } as any,
        config: { get: jest.fn().mockReturnValue(undefined) } as any,
        logger: { log: jest.fn(), error: jest.fn() } as any,
      }),
    ).resolves.toBeUndefined();
  });
});

