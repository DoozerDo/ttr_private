export const COVER_LETTER_REQUIRED_SALUTATION = 'Dear Hiring Team,';
export const COVER_LETTER_SIGNOFF = 'Sincerely,';

export const COVER_LETTER_WORD_LIMITS = {
  minimum: 250,
  preferredTarget: 320,
  maximum: 400,
} as const;

export const COVER_LETTER_MAX_BODY_PARAGRAPHS = 3;
export const COVER_LETTER_MAX_PARAGRAPH_WORDS = 130;

export const COVER_LETTER_FORBIDDEN_PHRASES = [
  'verified experience',
  'verified operational experience',
  'documented execution',
  'documented expertise',
  'clear ownership',
  'proven expertise',
  'i can contribute immediately',
];

export const COVER_LETTER_GENERIC_FILLER_PHRASES = [
  'i am writing to express my interest',
  'i am excited to apply',
  'please accept my application',
];

export const COVER_LETTER_BULLET_PATTERN =
  /^[\s]*([*•·●▪◦-]|[0-9]+\.)\s+/;

export const COVER_LETTER_RESUME_ARTIFACT_PATTERNS = [
  /\bpage\s*\d+\s*(?:\||\/|of)\s*\d+\b/gi,
  /\bp\.?\s*\d+\b/gi,
  /^\s*(summary|experience|education|skills|certifications)\s*:?$/gim,
  /\|/g,
];

export const COVER_LETTER_PHRASE_REWRITES: Array<{
  pattern: RegExp;
  replacement: string;
}> = [
  { pattern: /\bverified operational experience\b/gi, replacement: 'hands on operating experience' },
  { pattern: /\bverified experience\b/gi, replacement: 'direct experience' },
  { pattern: /\bdocumented execution\b/gi, replacement: 'consistent delivery' },
  { pattern: /\bdocumented expertise\b/gi, replacement: 'practical expertise' },
  { pattern: /\bclear ownership\b/gi, replacement: 'reliable ownership' },
  { pattern: /\bproven expertise\b/gi, replacement: 'strong judgment' },
  { pattern: /\bi can contribute immediately\b/gi, replacement: 'I can ramp quickly' },
];
