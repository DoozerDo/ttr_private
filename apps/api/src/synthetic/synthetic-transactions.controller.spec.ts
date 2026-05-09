import { SyntheticTransactionsController } from './synthetic-transactions.controller';

describe('SyntheticTransactionsController', () => {
  it('triggers core loop smoke runner', async () => {
    const runner = {
      runCoreLoopSmoke: jest.fn().mockResolvedValue({ status: 'succeeded' }),
      listRecentSyntheticTransactionRuns: jest.fn(),
      getLatestCoreLoopRun: jest.fn(),
    } as any;

    const controller = new SyntheticTransactionsController(runner);
    const result = await controller.runCoreLoopSmoke();

    expect(runner.runCoreLoopSmoke).toHaveBeenCalledWith('manual', '');
    expect(result).toEqual({ status: 'succeeded' });
  });
});
