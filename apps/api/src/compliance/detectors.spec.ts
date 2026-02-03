import { ComplianceFlagCode } from './compliance.types';
import { detectInventedRole } from './detectors';

describe('compliance detectors job context allowlist', () => {
  const coverLetterSections = [
    {
      title: 'Cover Letter',
      content:
        'Dear Hiring Team, I am applying for Head of Customer Services at Winona Health Industries.',
    },
  ];

  it('flags job role mention even when job context includes the role if not in an application sentence', () => {
    const flags = detectInventedRole({
      generatedSections: [
        {
          title: 'Cover Letter',
          content: 'Head of Customer Services gives the candidate perspective.',
        },
      ],
      baselineSections: [],
      jobContext: {
        allowedRoleTitles: ['Head of Customer Services'],
      },
    });

    expect(flags).toEqual([
      expect.objectContaining({
        code: ComplianceFlagCode.INVENTED_ROLE,
      }),
    ]);
  });
});
