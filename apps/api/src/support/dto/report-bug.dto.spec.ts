import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ReportBugDto } from './report-bug.dto';

describe('ReportBugDto', () => {
  it('requires a message', async () => {
    const dto = plainToInstance(ReportBugDto, {});
    const errors = await validate(dto);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'message' }),
      ]),
    );
  });

  it('rejects invalid screenshot data', async () => {
    const dto = plainToInstance(ReportBugDto, {
      message: 'failure happened',
      screenshotBase64: 'not-base64',
    });
    const errors = await validate(dto);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'screenshotBase64' }),
      ]),
    );
  });
});
