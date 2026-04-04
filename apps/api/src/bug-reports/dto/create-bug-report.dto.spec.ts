import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBugReportDto } from './create-bug-report.dto';

describe('CreateBugReportDto', () => {
  it('requires whatHappened', async () => {
    const dto = plainToInstance(CreateBugReportDto, { route: '/results' });
    const errors = await validate(dto);
    expect(errors).toEqual(expect.arrayContaining([expect.objectContaining({ property: 'whatHappened' })]));
  });
});
