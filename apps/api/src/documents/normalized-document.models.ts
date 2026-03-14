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
