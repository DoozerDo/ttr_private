import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';

describe('ResumeController', () => {
  it('returns DOCX download with headers', async () => {
    const send = jest.fn();
    const setHeader = jest.fn();
    const response = { setHeader, send };

    const resumeService = {
      exportResume: jest.fn().mockResolvedValue({
        buffer: Buffer.from('docx-content'),
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: 'resume.docx',
      }),
      generateResume: jest.fn(),
    } as unknown as ResumeService;

    const controller = new ResumeController(resumeService);

    await controller.exportResume(
      { baselineId: 'b', jobId: 'j' },
      { user: { id: 'user-1' } } as any,
      response as any,
    );

    expect(setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('resume.docx'),
    );
    expect(setHeader).toHaveBeenCalledWith('Content-Length', expect.any(String));
    expect(send).toHaveBeenCalledWith(expect.any(Buffer));
  });
});
