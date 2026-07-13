export type NormalizedResumeExperienceEntry = {
  company: string;
  roleTitle: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  dateRange?: string;
  bullets: string[];
};

export type NormalizedResumeEducationEntry = {
  institution: string;
  degree?: string;
  location?: string;
};

export type NormalizedResumeAdditionalSection = {
  title: string;
  items: string[];
};

export type NormalizedResumeDocument = {
  heading: {
    name: string;
    contactLine: string;
    links?: string[];
  };
  summary?: string;
  competencies?: string[];
  coreCompetencies?: string[];
  experience: NormalizedResumeExperienceEntry[];
  education?: NormalizedResumeEducationEntry[];
  additionalSections?: NormalizedResumeAdditionalSection[];
};

export type NormalizedCoverLetterDocument = {
  senderHeading: {
    name: string;
    contactLine?: string;
  };
  dateLine?: string;
  recipientLine?: string[];
  salutation: string;
  opening: string;
  bodyParagraphs: string[];
  closingParagraph: string;
  signoff: string;
  signatureName: string;
};

export const CANONICAL_COVER_LETTER_TEMPLATE_VERSION = 'canonical_cover_letter_v1' as const;

export type CanonicalCoverLetterParagraphKey = 'opening' | 'body_1' | 'body_2' | 'closing';

export type CanonicalCoverLetterParagraphEvidence = {
  paragraphKey: CanonicalCoverLetterParagraphKey;
  sourceEvidenceIds: string[];
  anchorTexts?: string[];
};

export type CanonicalCoverLetterDocument = NormalizedCoverLetterDocument & {
  templateVersion: typeof CANONICAL_COVER_LETTER_TEMPLATE_VERSION;
  companyName: string | null;
  roleTitle: string | null;
  paragraphEvidence: CanonicalCoverLetterParagraphEvidence[];
};

export type DocumentGenerationExports = {
  docx: boolean;
  pdf: boolean;
};

export type UserSafeDisplayPayload = {
  title: string;
  description: string;
  reasons: string[];
  cta: {
    label: string;
    href: string;
  };
};
