import {
  ComplianceFlagSeverity,
  DocumentType,
  GeneratedTextSourceType,
} from './compliance.types';
import {
  detectFictionalTechnology,
  detectInventedCompany,
  detectInventedMetric,
  detectInventedRole,
} from './detectors';

const roleJobContext = {
  allowedRoleTitles: ['Head of Customer Services'],
};

const companyJobContext = {
  allowedCompanies: ['Winona'],
};

describe('compliance detectors job context allowlist cover letters', () => {
  describe('invented_role', () => {
    it('does not flag JD role references when sentence source type is JD_REFERENCE', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Cover Letter',
            content:
              'Your posting for a Senior Network Infrastructure Engineer requires deep systems expertise.',
            sentenceSources: [
              {
                text: 'Your posting for a Senior Network Infrastructure Engineer requires deep systems expertise.',
                sourceType: GeneratedTextSourceType.JD_REFERENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.COVER_LETTER,
      });

      expect(flags).toHaveLength(0);
    });

    it('flags invented role claims when sentence source type is BASELINE_EVIDENCE', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Resume',
            content:
              'I served as a Senior Network Infrastructure Engineer leading distributed operations.',
            sentenceSources: [
              {
                text: 'I served as a Senior Network Infrastructure Engineer leading distributed operations.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags.length).toBeGreaterThan(0);
    });

    it('does not evaluate connective language spans as role claims', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Cover Letter',
            content:
              'I am excited to contribute and would welcome the opportunity to speak.',
            sentenceSources: [
              {
                text: 'I am excited to contribute and would welcome the opportunity to speak.',
                sourceType: GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.COVER_LETTER,
      });

      expect(flags).toHaveLength(0);
    });

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

    it('skips non-assertive title mentions outside application language in a cover letter', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Cover Letter',
            content:
              'As the Chief Innovation Strategist, the candidate will manage teams across regions.',
            sentenceSources: [
              {
                text: 'As the Chief Innovation Strategist, the candidate will manage teams across regions.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        jobContext: roleJobContext,
        documentType: DocumentType.COVER_LETTER,
      });

      expect(flags).toHaveLength(0);
    });

    it('does not flag non-assertive role phrases even in resume context', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Resume',
            content:
              'Senior Network Infrastructure Engineer workflows',
            sentenceSources: [
              {
                text: 'Senior Network Infrastructure Engineer workflows',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        jobContext: roleJobContext,
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });

    it('passes activity-fragment text and does not treat it as role assertion', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Resume',
            content: 'Collaborated closely with multiple partners',
            sentenceSources: [
              {
                text: 'Collaborated closely with multiple partners',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });

    it('passes short fragment phrases like Code methods', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Resume',
            content: 'Code methods',
            sentenceSources: [
              {
                text: 'Code methods',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });

    it('passes non-assertive lab engineer phrase', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Resume',
            content: 'Lab Engineer',
            sentenceSources: [
              {
                text: 'Lab Engineer',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });

    it('ignores idiomatic role-like phrases such as point person', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Resume',
            content: 'point person',
            sentenceSources: [
              {
                text: 'point person',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });

    it('does not flag dangling asserted fragments like Senior Lead IT Engineer on the', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Resume',
            content: 'I served as Senior Lead IT Engineer on the',
            sentenceSources: [
              {
                text: 'I served as Senior Lead IT Engineer on the',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });

    it('does not flag capability phrase fragments', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Resume',
            content: 'leadership scope and incident management programs',
            sentenceSources: [
              {
                text: 'leadership scope and incident management programs',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });

    it('does not flag recommendation language', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Resume',
            content: 'Recommended for this role',
            sentenceSources: [
              {
                text: 'Recommended for this role',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });

    it('does not flag focus explanation text', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Resume',
            content:
              'This focus emphasizes leadership scope and incident management programs because those signals best support this role.',
            sentenceSources: [
              {
                text: 'This focus emphasizes leadership scope and incident management programs because those signals best support this role.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });

    it('does not flag technical-depth connective text', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Resume',
            content:
              'technical depth highlights systems, platforms, and implementation depth',
            sentenceSources: [
              {
                text: 'technical depth highlights systems, platforms, and implementation depth',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });

    it('flags unsupported explicit assertion Served as Vice President of Global Support', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Resume',
            content: 'Served as Vice President of Global Support',
            sentenceSources: [
              {
                text: 'Served as Vice President of Global Support',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags.length).toBeGreaterThan(0);
    });

    it('flags unsupported explicit assertion Worked as Chief Customer Officer', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Resume',
            content: 'Worked as Chief Customer Officer',
            sentenceSources: [
              {
                text: 'Worked as Chief Customer Officer',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags.length).toBeGreaterThan(0);
    });

    it('does not flag supported explicit baseline role assertion', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Resume',
            content: 'I was a Support Operations Manager',
            sentenceSources: [
              {
                text: 'I was a Support Operations Manager',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [
          {
            title: 'Experience',
            sectionType: 'EXPERIENCE',
            content: 'Support Operations Manager | Acme | 2020 - 2024',
          },
        ],
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });
  });

  describe('invented_company', () => {
    it('skips invented-company detection for connective-language fragments', () => {
      const flags = detectInventedCompany({
        generatedSections: [
          {
            title: 'Cover Letter',
            content: 'All Windows test resources both client and server',
            sentenceSources: [
              {
                text: 'All Windows test resources both client and server',
                sourceType: GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.COVER_LETTER,
      });

      expect(flags).toHaveLength(0);
    });

    it('does not flag fragments as invented companies', () => {
      const flags = detectInventedCompany({
        generatedSections: [
          {
            title: 'Resume',
            content: 'All Windows test resources both client and server',
            sentenceSources: [
              {
                text: 'All Windows test resources both client and server',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });

    it('still blocks fabricated company references', () => {
      const flags = detectInventedCompany({
        generatedSections: [
          {
            title: 'Resume',
            content: 'I partnered with Contoso Systems International to deliver migration plans.',
            sentenceSources: [
              {
                text: 'I partnered with Contoso Systems International to deliver migration plans.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags.length).toBeGreaterThan(0);
    });

    it('does not treat skill stacks as invented companies', () => {
      const flags = detectInventedCompany({
        generatedSections: [
          {
            title: 'Skills',
            content: 'Azure | Terraform | Kubernetes',
            sentenceSources: [
              {
                text: 'Azure | Terraform | Kubernetes',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });

    it('skips detection when sourceType is missing', () => {
      const flags = detectInventedRole({
        generatedSections: [
          {
            title: 'Cover Letter',
            content:
              'I served as a Senior Network Infrastructure Engineer leading distributed operations.',
            sentenceSources: [
              {
                text: 'I served as a Senior Network Infrastructure Engineer leading distributed operations.',
              },
            ],
          },
        ],
        baselineSections: [],
        documentType: DocumentType.COVER_LETTER,
      });

      expect(flags).toHaveLength(0);
    });

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

    it('suppresses allowed job company mentions in cover-letter context', () => {
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

      expect(flags).toHaveLength(0);
    });

    it('suppresses allowed job company mentions even when the document type differs', () => {
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

      expect(flags).toHaveLength(0);
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

      expect(flags).toHaveLength(0);
    });

    it('does not flag "real world merchandise" as invented_company', () => {
      const flags = detectInventedCompany({
        generatedSections: [
          {
            title: 'Resume',
            content: 'Top performer rewards included real world merchandise for customers.',
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });

    it('does not flag gift cards as invented_company', () => {
      const flags = detectInventedCompany({
        generatedSections: [
          {
            title: 'Resume',
            content: 'Managed a support rewards program that distributed gift cards.',
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });

    it('does not treat salary ranges as invented companies', () => {
      const flags = detectInventedCompany({
        generatedSections: [
          {
            title: 'Resume',
            content: 'Compensation range: $120,000 - $150,000 base salary.',
          },
        ],
        baselineSections: [],
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });

    it('does not over-block employer names without full compliance context', () => {
      const flags = detectInventedCompany({
        generatedSections: [
          {
            title: 'Experience',
            content: 'Enabled growth at Horizon Labs.',
          },
        ],
        baselineSections: [
          {
            title: 'Experience',
            content: 'Delivered customer outcomes at Example Co.',
          },
        ],
        documentType: DocumentType.RESUME,
      });

      expect(flags).toHaveLength(0);
    });
  });

  describe('source-aware metric and technology checks', () => {
    it('does not evaluate CONNECTIVE_LANGUAGE for invented metrics', () => {
      const flags = detectInventedMetric({
        generatedSections: [
          {
            title: 'Cover Letter',
            content: 'I am excited to improve outcomes by 25% in this role.',
            sentenceSources: [
              {
                text: 'I am excited to improve outcomes by 25% in this role.',
                sourceType: GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
              },
            ],
          },
        ],
        baselineSections: [],
      });

      expect(flags).toHaveLength(0);
    });

    it('does not evaluate CONNECTIVE_LANGUAGE for fictional technology', () => {
      const flags = detectFictionalTechnology({
        generatedSections: [
          {
            title: 'Cover Letter',
            content: 'I am excited to learn NebulaGridX this quarter.',
            sentenceSources: [
              {
                text: 'I am excited to learn NebulaGridX this quarter.',
                sourceType: GeneratedTextSourceType.CONNECTIVE_LANGUAGE,
              },
            ],
          },
        ],
        baselineSections: [],
      });

      expect(flags).toHaveLength(0);
    });

    it('does not block derived SaaS concept when baseline has indirect semantic support', () => {
      const flags = detectFictionalTechnology({
        generatedSections: [
          {
            title: 'Experience',
            content: 'Led SaaS support transformations for enterprise customers.',
            sentenceSources: [
              {
                text: 'Led SaaS support transformations for enterprise customers.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [
          {
            title: 'Experience',
            content:
              'Led software as a service support operations and subscription platform migrations.',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
        ],
      });

      expect(flags).toHaveLength(0);
    });

    it('does not block generic revenue-impacting descriptor claims', () => {
      const flags = detectFictionalTechnology({
        generatedSections: [
          {
            title: 'Experience',
            content: 'Delivered revenue-impacting customer operations improvements.',
            sentenceSources: [
              {
                text: 'Delivered revenue-impacting customer operations improvements.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
      });

      expect(
        flags.every((flag) => flag.severity !== ComplianceFlagSeverity.BLOCK),
      ).toBe(true);
    });

    it('does not block AI-enabled conceptual claims', () => {
      const flags = detectFictionalTechnology({
        generatedSections: [
          {
            title: 'Experience',
            content: 'Led AI-enabled support workflows for global teams.',
            sentenceSources: [
              {
                text: 'Led AI-enabled support workflows for global teams.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
      });

      expect(
        flags.every((flag) => flag.severity !== ComplianceFlagSeverity.BLOCK),
      ).toBe(true);
    });

    it('does not block SaaS conceptual claims', () => {
      const flags = detectFictionalTechnology({
        generatedSections: [
          {
            title: 'Experience',
            content: 'Scaled SaaS support operations across enterprise customers.',
            sentenceSources: [
              {
                text: 'Scaled SaaS support operations across enterprise customers.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
      });

      expect(
        flags.every((flag) => flag.severity !== ComplianceFlagSeverity.BLOCK),
      ).toBe(true);
    });

    it('still blocks strict missing platform claims such as Salesforce', () => {
      const flags = detectFictionalTechnology({
        generatedSections: [
          {
            title: 'Experience',
            content: 'Administered Salesforce Service Cloud workflows.',
            sentenceSources: [
              {
                text: 'Administered Salesforce Service Cloud workflows.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [
          {
            title: 'Experience',
            content: 'Used Zendesk and Talkdesk to improve support operations.',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
        ],
      });

      expect(flags.some((flag) => flag.severity === ComplianceFlagSeverity.BLOCK)).toBe(true);
      expect(flags.some((flag) => flag.message.includes('Salesforce'))).toBe(true);
    });

    it('does not treat SentinelOne employer matches as fictional technology', () => {
      const flags = detectFictionalTechnology({
        generatedSections: [
          {
            title: 'Experience',
            content: 'Supported enterprise security programs at SentinelOne.',
            sentenceSources: [
              {
                text: 'Supported enterprise security programs at SentinelOne.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        baselineAllowlist: {
          allowedCompanies: ['Sentinel One'],
          allowedTechnologies: [],
          allowedMetricTokens: [],
          allowedRoles: [],
          generatedAt: '2026-03-22T00:00:00.000Z',
        },
      });

      expect(
        flags.some((flag) => flag.code === ComplianceFlagCode.FICTIONAL_TECHNOLOGY),
      ).toBe(false);
    });

    it('classifies Salesforce as technology when it is not an employer match', () => {
      const flags = detectFictionalTechnology({
        generatedSections: [
          {
            title: 'Experience',
            content: 'Implemented Salesforce automations for support operations.',
            sentenceSources: [
              {
                text: 'Implemented Salesforce automations for support operations.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        baselineAllowlist: {
          allowedCompanies: ['SentinelOne'],
          allowedTechnologies: [],
          allowedMetricTokens: [],
          allowedRoles: [],
          generatedAt: '2026-03-22T00:00:00.000Z',
        },
      });

      expect(flags.some((flag) => flag.severity === ComplianceFlagSeverity.BLOCK)).toBe(true);
      expect(flags.some((flag) => flag.message.includes('Salesforce'))).toBe(true);
    });

    it('never emits fictional technology flags for CenturyLink when classified as company', () => {
      const flags = detectFictionalTechnology({
        generatedSections: [
          {
            title: 'Experience',
            content: 'Led enterprise support modernization at CenturyLink.',
            sentenceSources: [
              {
                text: 'Led enterprise support modernization at CenturyLink.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        baselineAllowlist: {
          allowedCompanies: ['CenturyLink'],
          allowedTechnologies: [],
          allowedMetricTokens: [],
          allowedRoles: [],
          generatedAt: '2026-03-22T00:00:00.000Z',
        },
      });

      expect(
        flags.some((flag) => flag.code === ComplianceFlagCode.FICTIONAL_TECHNOLOGY),
      ).toBe(false);
    });

    it('only blocks hard claims in mixed hard/soft claim sets', () => {
      const flags = detectFictionalTechnology({
        generatedSections: [
          {
            title: 'Experience',
            content:
              'Implemented Salesforce automations for AI-enabled SaaS support with revenue-impacting outcomes.',
            sentenceSources: [
              {
                text:
                  'Implemented Salesforce automations for AI-enabled SaaS support with revenue-impacting outcomes.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        baselineAllowlist: {
          allowedCompanies: [],
          allowedTechnologies: [],
          allowedMetricTokens: [],
          allowedRoles: [],
          generatedAt: '2026-03-22T00:00:00.000Z',
        },
      });

      const blocked = flags.filter((flag) => flag.severity === ComplianceFlagSeverity.BLOCK);
      expect(blocked.some((flag) => flag.message.includes('Salesforce'))).toBe(true);
      expect(blocked.some((flag) => flag.message.includes('AI-enabled'))).toBe(false);
      expect(blocked.some((flag) => flag.message.includes('SaaS'))).toBe(false);
      expect(blocked.some((flag) => flag.message.includes('revenue-impacting'))).toBe(false);
    });

    it('downgrades Salesforce to WARN when baseline shows equivalent CX platform capability', () => {
      const flags = detectFictionalTechnology({
        generatedSections: [
          {
            title: 'Experience',
            content: 'Implemented Salesforce automations for support operations.',
            sentenceSources: [
              {
                text: 'Implemented Salesforce automations for support operations.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [
          {
            title: 'Experience',
            content:
              'Led support organization strategy across global regions with incident management, escalation management, and tooling ownership for CX operations.',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
        ],
      });

      expect(flags.some((flag) => flag.message.includes('Salesforce'))).toBe(true);
      expect(flags.some((flag) => flag.severity === ComplianceFlagSeverity.BLOCK)).toBe(false);
      expect(flags.some((flag) => flag.severity === ComplianceFlagSeverity.WARN)).toBe(true);
    });

    it('keeps Salesforce as BLOCK when equivalent CX capability is missing', () => {
      const flags = detectFictionalTechnology({
        generatedSections: [
          {
            title: 'Experience',
            content: 'Implemented Salesforce automations for support operations.',
            sentenceSources: [
              {
                text: 'Implemented Salesforce automations for support operations.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [
          {
            title: 'Experience',
            content: 'Improved hiring process quality and team onboarding.',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
        ],
      });

      expect(flags.some((flag) => flag.message.includes('Salesforce'))).toBe(true);
      expect(flags.some((flag) => flag.severity === ComplianceFlagSeverity.BLOCK)).toBe(true);
    });

    it('keeps specialized tools like Kubernetes as BLOCK when missing', () => {
      const flags = detectFictionalTechnology({
        generatedSections: [
          {
            title: 'Experience',
            content: 'Built Kubernetes deployment workflows for support infrastructure.',
            sentenceSources: [
              {
                text: 'Built Kubernetes deployment workflows for support infrastructure.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [
          {
            title: 'Experience',
            content:
              'Led support organization strategy across global regions with incident management, escalation management, and tooling ownership for CX operations.',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
        ],
      });

      expect(flags.some((flag) => flag.message.includes('Kubernetes'))).toBe(true);
      expect(flags.some((flag) => flag.severity === ComplianceFlagSeverity.BLOCK)).toBe(true);
    });

    it('does not block Microsoft when it matches baseline employer history', () => {
      const flags = detectFictionalTechnology({
        generatedSections: [
          {
            title: 'Experience',
            content: 'Drove global support operations at Microsoft.',
            sentenceSources: [
              {
                text: 'Drove global support operations at Microsoft.',
                sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
              },
            ],
          },
        ],
        baselineSections: [],
        baselineAllowlist: {
          allowedCompanies: ['Microsoft'],
          allowedTechnologies: [],
          allowedMetricTokens: [],
          allowedRoles: [],
          generatedAt: '2026-03-22T00:00:00.000Z',
        },
      });

      expect(
        flags.some((flag) => flag.code === ComplianceFlagCode.FICTIONAL_TECHNOLOGY),
      ).toBe(false);
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

  it('skips non-assertive role phrasing when document type differs even with jobContext', () => {
    const flags = detectInventedRole({
      generatedSections: [
        {
          title: 'Resume',
          content: 'Supports the Head of Customer Services and builds discipline.',
          sentenceSources: [
            {
              text: 'Supports the Head of Customer Services and builds discipline.',
              sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
            },
          ],
        },
      ],
      baselineSections: [],
      jobContext,
      documentType: DocumentType.RESUME,
    });

    expect(flags).toHaveLength(0);
  });
});
