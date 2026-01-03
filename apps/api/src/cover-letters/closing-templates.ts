import { CoverLetterClosingTemplate } from './generators/cover-letter-generator.interface';

export const COVER_LETTER_CLOSING_TEMPLATES: CoverLetterClosingTemplate[] = [
  {
    key: 'steady',
    text: 'I am ready to execute steadily, stay aligned with documented scope, and keep communication clear and predictable.',
  },
  {
    key: 'impact',
    text: 'I will stay focused on measurable impact while keeping every claim anchored to verified baseline material.',
  },
  {
    key: 'collaborative',
    text: 'I look forward to collaborating closely, checking expectations early, and sharing progress in transparent updates.',
  },
];

export const DEFAULT_COVER_LETTER_CLOSING_TEMPLATE_KEY =
  COVER_LETTER_CLOSING_TEMPLATES[0].key;

export function resolveClosingTemplate(key?: string | null) {
  return (
    COVER_LETTER_CLOSING_TEMPLATES.find((template) => template.key === key) ??
    COVER_LETTER_CLOSING_TEMPLATES[0]
  );
}
