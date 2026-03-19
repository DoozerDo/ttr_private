import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AutoErrorDto, AutoErrorType } from './auto-error.dto';

describe('AutoErrorDto', () => {
  it('requires core fields', async () => {
    const dto = plainToInstance(AutoErrorDto, {});
    const errors = await validate(dto);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'errorType' }),
        expect.objectContaining({ property: 'message' }),
        expect.objectContaining({ property: 'timestamp' }),
      ]),
    );
  });

  it('rejects invalid status and unknown error type', async () => {
    const dto = plainToInstance(AutoErrorDto, {
      errorType: 'unknown',
      message: 'failed',
      timestamp: '2026-03-18T00:00:00.000Z',
      status: 42,
    });
    const errors = await validate(dto);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'errorType' }),
        expect.objectContaining({ property: 'status' }),
      ]),
    );
  });

  it('accepts a valid minimal payload', async () => {
    const dto = plainToInstance(AutoErrorDto, {
      errorType: AutoErrorType.API,
      message: 'api failed with 500',
      endpoint: '/api/analysis/latest',
      method: 'GET',
      status: 500,
      route: '/results',
      timestamp: '2026-03-18T00:00:00.000Z',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
