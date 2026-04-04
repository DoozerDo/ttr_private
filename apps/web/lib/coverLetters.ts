export type CoverLetterClosingTemplate = {
  key: string;
  label: string;
  text: string;
};

export const coverLetterClosingTemplates: CoverLetterClosingTemplate[] = [
  {
    key: "steady",
    label: "Steady delivery",
    text: "I am ready to execute steadily, stay aligned with documented scope, and keep communication clear and predictable.",
  },
  {
    key: "impact",
    label: "Impact-focused",
    text: "I will stay focused on measurable impact while keeping every claim anchored to verified baseline material.",
  },
  {
    key: "collaborative",
    label: "Collaborative",
    text: "I look forward to collaborating closely, checking expectations early, and sharing progress in transparent updates.",
  },
];

export const defaultClosingTemplateKey = coverLetterClosingTemplates[0].key;
