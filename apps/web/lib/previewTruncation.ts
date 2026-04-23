export type PreviewTruncation = {
  text: string;
  totalLength: number;
  previewLength: number;
  truncated: boolean;
};

type Options = {
  maxChars: number;
  maxLines?: number;
};

function clampNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function truncateForPreview(input: string, options: Options): PreviewTruncation {
  const raw = typeof input === "string" ? input : "";
  const totalLength = raw.length;

  const maxChars = clampNonNegativeInt(options.maxChars);
  const maxLines = options.maxLines === undefined ? undefined : clampNonNegativeInt(options.maxLines);

  let clipped = raw;

  if (typeof maxLines === "number" && maxLines > 0) {
    const lines = clipped.split(/\r?\n/);
    if (lines.length > maxLines) {
      clipped = lines.slice(0, maxLines).join("\n");
    }
  }

  if (maxChars > 0 && clipped.length > maxChars) {
    clipped = clipped.slice(0, maxChars);
  }

  const truncated = clipped.length !== raw.length;
  return {
    text: clipped,
    totalLength,
    previewLength: clipped.length,
    truncated,
  };
}

