import { DocumentType } from './compliance.types';
import { detectInventedCompany, detectInventedRole } from './detectors';

const roleJobContext = {
  allowedRoleTitles: ['Head of Customer Services'],
};

const companyJobContext = {
  allowedCompanies: ['Winona'],
};

describe('compliance detectors job context allowlist cover letters', () => {
  describe('invented_role', () => {
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
        jobContext: roleJobContext,
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
        jobContext: roleJobContext,
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
        jobContext: roleJobContext,
        documentType: DocumentType.RESUME,
      });

      expect(flags.length).toBeGreaterThan(0);
    });
  });

  describe('invented_company', () => {
    it('suppresses invented_company inside the cover letter application window', () => {
      const flags = detectInventedCompany({
        generatedSections: [
          {
            title: 'Cover Letter',
            content:
              'Dear Hiring Team, I am applying for this role at Winona because of the impact you make.',
          },
        ],
        baselineSections: [],
        jobContext: companyJobContext,
        documentType: DocumentType.COVER_LETTER,
      });

      expect(flags).toHaveLength(0);
    });

    it('ignores lowercase non-company phrases in cover letters', () => {
      const flags = detectInventedCompany({
        generatedSections: [
          {
            title: 'Cover Letter',
            content: 'documented scope keeps the project grounded in practical hiring needs.',
          },
        ],
        baselineSections: [],
        documentType: DocumentType.COVER_LETTER,
      });

      expect(flags).toHaveLength(0);
    });

    it('still blocks invented_company when the job name appears outside the application window', () => {
      const flags = detectInventedCompany({
        generatedSections: [
          {
            title: 'Cover Letter',
            content: 'Winona is expanding globally and the candidate has studied its strategy.',
          },
        ],
        baselineSections: [],
        jobContext: companyJobContext,
        documentType: DocumentType.COVER_LETTER,
      });

      expect(flags.length).toBeGreaterThan(0);
    });

    it('continues to flag the company when the document type is not cover letter', () => {
      const flags = detectInventedCompany({
        generatedSections: [
          {
            title: 'Resume',
            content:
              'Dear Hiring Team, I am applying for the Head of Customer Services role at Winona.',
          },
        ],
        baselineSections: [],
        jobContext: companyJobContext,
        documentType: DocumentType.RESUME,
      });

      expect(flags.length).toBeGreaterThan(0);
    });

    it('still flags lowercase phrases outside cover letter contexts', () => {
      const flags = detectInventedCompany({
        generatedSections: [
          {
            title: 'Resume',
            content: 'documented scope keeps the project grounded in practical hiring needs.',
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags.length).toBeGreaterThan(0);
    });
  });
});

describe('cover letter job context allowlist', () => {
  const jobContext = {
    allowedCompanies: ['Winona'],
    allowedRoleTitles: ['Head of Customer Services'],
  };

  it('permits allowed company mentions within cover letters', () => {
    const flags = detectInventedCompany({
      generatedSections: [
        {
          title: 'Cover Letter',
          content: 'Dear Hiring Team, I am applying to Winona as a strategic hire.',
        },
      ],
      baselineSections: [],
      jobContext,
      documentType: DocumentType.COVER_LETTER,
    });

    expect(flags).toHaveLength(0);
  });

  it('permits allowed role mentions within cover letters', () => {
    const flags = detectInventedRole({
      generatedSections: [
        {
          title: 'Cover Letter',
          content: 'The candidate supports the Head of Customer Services with measurable steps.',
        },
      ],
      baselineSections: [],
      jobContext,
      documentType: DocumentType.COVER_LETTER,
    });

    expect(flags).toHaveLength(0);
  });

  it('suppresses about phrases in cover letters', () => {
    const flags = detectInventedRole({
      generatedSections: [
        {
          title: 'Cover Letter',
          content: 'About Winona and about the teams we serve.',
        },
      ],
      baselineSections: [],
      jobContext,
      documentType: DocumentType.COVER_LETTER,
    });

    expect(flags).toHaveLength(0);
  });

  it('still flags when document type differs even with jobContext', () => {
    const flags = detectInventedRole({
      generatedSections: [
        {
          title: 'Resume',
          content: 'Supports the Head of Customer Services and builds discipline.',
        },
      ],
      baselineSections: [],
      jobContext,
      documentType: DocumentType.RESUME,
    });

    expect(flags.length).toBeGreaterThan(0);
  });
});
