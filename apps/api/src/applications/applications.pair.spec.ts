import { BadRequestException } from '@nestjs/common';
import { ApplicationsService } from './applications.service';

describe('ApplicationsService pair lookup contract', () => {
  it('returns null when no application exists yet for the pair', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const service = new ApplicationsService(repository as any, {} as any);

    await expect(service.getApplicationForPair('user-1', 'base-1', 'job-1')).resolves.toBeNull();
    expect(repository.findOne).toHaveBeenCalled();
  });

  it('still rejects malformed baseline/job ids', async () => {
    const repository = { findOne: jest.fn() };
    const service = new ApplicationsService(repository as any, {} as any);

    await expect(service.getApplicationForPair('user-1', '   ', 'job-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getApplicationForPair('user-1', 'base-1', '   ')).rejects.toBeInstanceOf(BadRequestException);
  });
});

