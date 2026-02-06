import { CoverLetterDocxModel } from '../docx-template.types';

function splitParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function detectClosingLines(paragraphs: string[]) {
  const closings: string[] = [];
  for (let i = paragraphs.length - 1; i >= 0; i -= 1) {
    const paragraph = paragraphs[i];
    if (paragraph.match(/^(Sincerely|Best|Regards|Thank you)/i)) {
      closings.unshift(paragraph);
      paragraphs.pop();
      continue;
    }
    break;
  }
  return closings;
}

export function mapCoverLetterTextToModel(text: string): CoverLetterDocxModel {
  const cleaned = text.replace(/\r/g, '');
  const paragraphs = splitParagraphs(cleaned);
  const greeting = 'Dear Hiring Team,';
  if (paragraphs[0] === greeting) {
    paragraphs.shift();
  }
  const workingParagraphs = [...paragraphs];
  const closingLines = detectClosingLines(workingParagraphs);
  return {
    greeting,
    paragraphs: workingParagraphs,
    closingLines: closingLines.length ? closingLines : undefined,
    signatureName: closingLines.length ? closingLines[closingLines.length - 1] : undefined,
  };
}
