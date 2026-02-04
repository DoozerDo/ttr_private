import { ComplianceFlagCode, DocumentType } from './compliance.types';
import { detectInventedRole } from './detectors';

const jobContext = {
  allowedRoleTitles: ['Head of Customer Services'],
};

describe('compliance detectors job context allowlist cover letters', () => {
  it('suppresses invented_role for cover letter opening text with application language', () => {
    const flags = detectInventedRole({
      generatedSections: [
        {
          title: 'Cover Letter',
          content:
            'Dear Hiring Team, I am applying for the Head of Customer Services role at Winona.',
        },
      ],
      baselineSections: [],
      jobContext,
      documentType: DocumentType.COVER_LETTER,
    });

    expect(flags).toHaveLength(0);
  });

  it('still blocks when the same title appears outside application language in a cover letter', () => {
    const flags = detectInventedRole({
      generatedSections: [
        {
          title: 'Cover Letter',
          content:
            'As the Head of Customer Services, the candidate will manage teams across regions.',
        },
      ],
      baselineSections: [],
      jobContext,
      documentType: DocumentType.COVER_LETTER,
    });

    expect(flags.length).toBeGreaterThan(0);
  });

  it('continues to flag the fragment when the document type is not cover letter', () => {
    const flags = detectInventedRole({
      generatedSections: [
        {
          title: 'Resume',
          content:
            'Dear Hiring Team, I am applying for the Head of Customer Services role.',
        },
      ],
      baselineSections: [],
      jobContext,
      documentType: DocumentType.RESUME,
    });

    expect(flags.length).toBeGreaterThan(0);
  });
});
