import { ForbiddenException } from '@nestjs/common';
import { SyntheticIngestGuard } from './synthetic-ingest.guard';

describe('SyntheticIngestGuard', () => {
  const configService = {
    get: jest.fn(),
  } as any;

  const makeContext = (token?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: token ? { 'x-synthetic-ingest-token': token } : {},
        }),
      }),
    }) as any;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockReturnValue('synthetic-ingest-local');
  });

  it('allows the configured synthetic ingest token', () => {
    const guard = new SyntheticIngestGuard(configService);
    expect(guard.canActivate(makeContext('synthetic-ingest-local'))).toBe(true);
  });

  it('rejects missing or mismatched ingest tokens', () => {
    const guard = new SyntheticIngestGuard(configService);
    expect(() => guard.canActivate(makeContext())).toThrow(ForbiddenException);
    expect(() => guard.canActivate(makeContext('wrong-token'))).toThrow(ForbiddenException);
  });
});
