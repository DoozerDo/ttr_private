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

  it('accepts legacy description as message', async () => {
    const dto = plainToInstance(ReportBugDto, {
      description: 'Legacy description field still gets accepted.',
    } as unknown as ReportBugDto);
    const errors = await validate(dto);
    expect(errors).toEqual([]);
    expect(dto.description).toBe('Legacy description field still gets accepted.');
  });

  it('prefers message over legacy description', async () => {
    const dto = plainToInstance(ReportBugDto, {
      message: 'Canonical message wins.',
      description: 'Legacy description should be ignored.',
    } as unknown as ReportBugDto);
    const errors = await validate(dto);
    expect(errors).toEqual([]);
    expect(dto.message).toBe('Canonical message wins.');
  });

  it('rejects a short message', async () => {
    const dto = plainToInstance(ReportBugDto, { message: 'short' });
    const errors = await validate(dto);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'message' }),
      ]),
    );
  });

  it('rejects a long message', async () => {
    const dto = plainToInstance(ReportBugDto, { message: 'a'.repeat(4001) });
    const errors = await validate(dto);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'message' }),
      ]),
    );
  });

  it('accepts optional details field', async () => {
    const dto = plainToInstance(ReportBugDto, {
      message: 'Valid bug report message with enough length.',
      details: 'More context provided by the user.',
    });
    const errors = await validate(dto);
    expect(errors).toEqual([]);
    expect(dto.details).toBe('More context provided by the user.');
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
