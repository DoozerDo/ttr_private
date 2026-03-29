import { UnprocessableEntityException } from '@nestjs/common';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';

describe('ResumeController generation contract', () => {
  it('surfaces generation_blocked as HTTP 422 payload', async () => {
    const service = {
      generateResume: jest.fn().mockRejectedValue(
        new UnprocessableEntityException({
          code: 'generation_blocked',
          message:
            'Generation is not available for this role due to insufficient verified evidence.',
          blockers: [{ code: 'full_block', message: 'Missing verified evidence.' }],
        }),
      ),
    } as unknown as ResumeService;

    const controller = new ResumeController(service);

    await expect(
      controller.generateResume(
        {
          baselineId: 'baseline-1',
          baselineVersionId: 'version-1',
          jobId: 'job-1',
          analysisId: 'analysis-1',
        },
        { user: { id: 'user-1' } } as any,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'generation_blocked',
      },
      status: 422,
    });
  });
});

