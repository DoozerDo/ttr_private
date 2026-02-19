import { getCharCount } from '../common/text-metrics';

export const MIN_EXTRACTED_CHARS = 600;
export const INSUFFICIENT_EXTRACTED_TEXT_ERROR_CODE =
  'insufficient_extracted_text';
export const INSUFFICIENT_EXTRACTED_TEXT_ERROR_MESSAGE =
  'We could not extract enough text from that resume.';
const EXTREMELY_LOW_CHAR_THRESHOLD = 200;
const PREVIEW_MAX_CHARS = 400;
const MIN_ALPHA_RATIO = 0.4;

type InsufficientExtractionTipsRecord = Record<
  InsufficientExtractedTextReason,
  string[]
>;

export type InsufficientExtractedTextReason =
  | 'likely_extraction_failure'
  | 'resume_too_short';

export type InsufficientExtractedTextDetails = {
  minChars: number;
  extractedChars: number;
  preview: string;
  reason: InsufficientExtractedTextReason;
  tips: string[];
};

const INSPECTION_TIPS: InsufficientExtractionTipsRecord = {
  likely_extraction_failure: [
    'Export the resume to a text-based PDF from Word or Google Docs instead of a scanned PDF.',
    'If the PDF is scanned, run OCR and re-export so the text is machine readable.',
    'Upload the original DOCX file if it is available, or re-export the PDF after OCR.',
  ],
  resume_too_short: [
    'Add missing sections such as Experience, Skills, and Education to cover your full story.',
    'Ensure each section contains full bullet content rather than only headings or labels.',
  ],
};

const OCR_GARBAGE_SEQUENCES = [
  /ï»¿/,
  /â€¢/,
  /â€”/,
  /â€“/,
  /â€¦/,
  /â€/,
  /Ã[\u0080-\u00bf]/,
  /Â[\u0080-\u00bf]/,
  /\uFFFD/,
];

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function buildPreview(text: string): string {
  const collapsed = collapseWhitespace(text);
  if (!collapsed) return '';
  return collapsed.slice(0, PREVIEW_MAX_CHARS);
}

function containsOcrArtifacts(value: string): boolean {
  if (!value) return false;
  return OCR_GARBAGE_SEQUENCES.some((pattern) => pattern.test(value));
}

function alphabeticRatio(value: string): number {
  if (!value) return 0;
  const letters = [...value].filter((char) => /[A-Za-z]/.test(char));
  return value.length ? letters.length / value.length : 0;
}

function determineReason(
  extractedChars: number,
  preview: string,
): InsufficientExtractedTextReason {
  if (
    extractedChars < EXTREMELY_LOW_CHAR_THRESHOLD ||
    alphabeticRatio(preview) < MIN_ALPHA_RATIO ||
    containsOcrArtifacts(preview)
  ) {
    return 'likely_extraction_failure';
  }
  return 'resume_too_short';
}

export function evaluateExtractedText(text: string): {
  extractedChars: number;
  preview: string;
  reason: InsufficientExtractedTextReason;
} {
  const extractedChars = getCharCount(text ?? '');
  const preview = buildPreview(text ?? '');
  const reason = determineReason(extractedChars, preview);
  return { extractedChars, preview, reason };
}

export function getInsufficientExtractedTextDetails(
  text: string,
): InsufficientExtractedTextDetails | null {
  const normalized = text ?? '';
  const { extractedChars, preview, reason } = evaluateExtractedText(normalized);
  if (extractedChars >= MIN_EXTRACTED_CHARS) {
    return null;
  }
  return {
    minChars: MIN_EXTRACTED_CHARS,
    extractedChars,
    preview,
    reason,
    tips: INSPECTION_TIPS[reason],
  };
}
