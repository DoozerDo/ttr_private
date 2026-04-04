type LinkedInSanitizeResult = {
  text: string;
  removed: string[];
};

type LinkedInSanitizeInput = {
  sourceUrl?: string | null;
  rawText?: string | null;
};

const LINKEDIN_HOST_MARKERS = ['linkedin.com', 'lnkd.in'];

const CUTOFF_MARKERS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: 'experts_add_insights',
    pattern: /experts add insights directly into each article/i,
  },
];

const LINE_MARKERS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'explore_more', pattern: /^explore more$/i },
  { label: 'join_now', pattern: /^join now$/i },
  { label: 'sign_in', pattern: /^sign in$/i },
  { label: 'linkedin_brand', pattern: /^linkedin( logo| corporation)?$/i },
  { label: 'linkedin_copyright', pattern: /^©\s*linkedin/i },
  {
    label: 'linkedin_footer',
    pattern:
      /^(privacy policy|cookie policy|user agreement|community guidelines|accessibility|help center)$/i,
  },
];

const BOILERPLATE_MARKER_PATTERN =
  /experts add insights directly into each article|explore more/i;

const normalizeLineEndings = (value: string) =>
  value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

const isLinkedInHost = (hostname: string) =>
  LINKEDIN_HOST_MARKERS.some((marker) => hostname.includes(marker));

export const shouldApplyLinkedInSanitizer = ({
  sourceUrl,
  rawText,
}: LinkedInSanitizeInput): boolean => {
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (isLinkedInHost(parsed.hostname.toLowerCase())) {
        return true;
      }
    } catch {
      //
    }
  }

  return Boolean(rawText && BOILERPLATE_MARKER_PATTERN.test(rawText));
};

export const sanitizeLinkedInJobText = (raw: string): LinkedInSanitizeResult => {
  if (!raw) {
    return { text: raw, removed: [] };
  }

  let text = normalizeLineEndings(raw);
  const removed = new Set<string>();

  for (const marker of CUTOFF_MARKERS) {
    const match = text.match(marker.pattern);
    if (match?.index !== undefined) {
      removed.add(marker.label);
      text = text.slice(0, match.index);
      break;
    }
  }

  const lines = text.split('\n');
  const filteredLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return false;
    }

    for (const marker of LINE_MARKERS) {
      if (marker.pattern.test(trimmed)) {
        removed.add(marker.label);
        return false;
      }
    }

    return true;
  });

  const sanitized = filteredLines.join('\n').trim();
  return {
    text: sanitized,
    removed: Array.from(removed),
  };
};
