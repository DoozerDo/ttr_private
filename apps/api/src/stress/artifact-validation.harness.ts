type ArtifactTraceDebug = {
  passed: boolean;
  failures: string[];
  traceCoverage: number;
  unusedEvidence: string[];
  selectedEvidence: string[];
};

export type NormalizedArtifactAudit = {
  artifactType: 'resume' | 'cover_letter';
  passed: boolean;
  failures: string[];
  traceCoverage: number;
  selectedEvidence: string[];
  unusedEvidence: string[];
  determinismPassed: boolean;
};

type TraceableArtifact = {
  traceMap?: Record<string, string[]>;
  debugTrace?: ArtifactTraceDebug;
};

type ResumeArtifactLike = TraceableArtifact & {
  preview?: {
    resume?: {
      summary?: string;
      experience?: Array<{ bullets?: string[] }>;
      education?: Array<Record<string, unknown>>;
      competencies?: Array<Record<string, unknown>>;
      coreCompetencies?: Array<Record<string, unknown>>;
      additionalSections?: Array<Record<string, unknown>>;
    } | null;
  };
};

type CoverLetterArtifactLike = TraceableArtifact & {
  preview?: {
    coverLetter?: {
      salutation?: string;
      opening?: string;
      bodyParagraphs?: string[];
      closingParagraph?: string;
      signoff?: string;
      signatureName?: string;
    } | null;
  };
  paragraphs?: string[];
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function compareArtifactDeterminism<T>(first: T, second: T): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

export function assertResumeArtifactIntegrity(
  artifact: ResumeArtifactLike,
  options?: {
    minimumBulletCount?: number;
    jdText?: string;
    forbiddenPhrases?: string[];
  },
) {
  const failures: string[] = [];
  const debug = artifact.debugTrace;
  const preview = artifact.preview?.resume ?? null;

  if (!preview) {
    failures.push('resume preview is missing');
  }

  const experienceBullets = preview?.experience?.flatMap((entry) => entry.bullets ?? []) ?? [];
  if (options?.minimumBulletCount && experienceBullets.length < options.minimumBulletCount) {
    failures.push('resume bullets fell below the expected minimum');
  }

  for (const [lineId, ids] of Object.entries(artifact.traceMap ?? {})) {
    if (!ids.length) {
      failures.push(`resume line ${lineId} has no trace mapping`);
    }
    if (new Set(ids).size !== ids.length) {
      failures.push(`resume line ${lineId} has ambiguous evidence mapping`);
    }
  }

  if (debug && !debug.passed) {
    failures.push(...debug.failures);
  }

  if (options?.jdText) {
    const jdTokens = normalizeText(options.jdText)
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length > 4);
    const resumeText = [
      preview?.summary ?? '',
      ...experienceBullets,
      ...(preview?.education ?? []).map((entry) => JSON.stringify(entry)),
      ...(preview?.competencies ?? []).map((entry) => JSON.stringify(entry)),
      ...(preview?.coreCompetencies ?? []).map((entry) => JSON.stringify(entry)),
    ]
      .join(' ')
      .toLowerCase();
    const overlap = jdTokens.filter((token) => resumeText.includes(token));
    if (overlap.length > 14) {
      failures.push('resume JD leakage exceeded tolerance');
    }
  }

  if (options?.forbiddenPhrases?.length) {
    const text = JSON.stringify(preview ?? artifact).toLowerCase();
    for (const phrase of options.forbiddenPhrases) {
      if (text.includes(phrase.toLowerCase())) {
        failures.push(`resume contains forbidden phrase: ${phrase}`);
      }
    }
  }

  return {
    artifactType: 'resume' as const,
    passed: failures.length === 0 && Boolean(debug?.passed),
    failures,
    traceCoverage: debug?.traceCoverage ?? 0,
    selectedEvidence: debug?.selectedEvidence ?? [],
    unusedEvidence: debug?.unusedEvidence ?? [],
    determinismPassed: true,
  };
}

export function assertCoverLetterArtifactIntegrity(
  artifact: CoverLetterArtifactLike,
  options?: {
    jdText?: string;
    maxJdOverlap?: number;
  },
) {
  const failures: string[] = [];
  const debug = artifact.debugTrace;
  const paragraphs =
    artifact.preview?.coverLetter
      ? [
          artifact.preview.coverLetter.salutation ?? '',
          artifact.preview.coverLetter.opening ?? '',
          ...(artifact.preview.coverLetter.bodyParagraphs ?? []),
          artifact.preview.coverLetter.closingParagraph ?? '',
          artifact.preview.coverLetter.signoff ?? '',
          artifact.preview.coverLetter.signatureName ?? '',
        ]
      : artifact.paragraphs ?? [];

  if (paragraphs.length < 5) {
    failures.push('cover letter structure is incomplete');
  }

  for (const [lineId, ids] of Object.entries(artifact.traceMap ?? {})) {
    if (!ids.length) {
      failures.push(`cover letter line ${lineId} has no trace mapping`);
    }
    if (new Set(ids).size !== ids.length) {
      failures.push(`cover letter line ${lineId} has ambiguous evidence mapping`);
    }
  }

  if (debug && !debug.passed) {
    failures.push(...debug.failures);
  }

  if (options?.jdText) {
    const jdTokens = normalizeText(options.jdText)
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length > 4);
    const artifactText = normalizeText(paragraphs.join(' ')).toLowerCase();
    const overlap = jdTokens.filter((token) => artifactText.includes(token));
    if (overlap.length > (options.maxJdOverlap ?? 22)) {
      failures.push('cover letter JD leakage exceeded tolerance');
    }
  }

  const normalizedParagraphs = paragraphs.map(normalizeText).filter(Boolean);
  const salutationCount = normalizedParagraphs.filter((line) =>
    /dear hiring team,/i.test(line),
  ).length;
  const signoffCount = normalizedParagraphs.filter((line) =>
    /sincerely,?/i.test(line),
  ).length;
  if (salutationCount > 1) {
    failures.push('duplicate salutation detected');
  }
  if (signoffCount > 1) {
    failures.push('duplicate closing detected');
  }

  return {
    artifactType: 'cover_letter' as const,
    passed: failures.length === 0 && Boolean(debug?.passed),
    failures,
    traceCoverage: debug?.traceCoverage ?? 0,
    selectedEvidence: debug?.selectedEvidence ?? [],
    unusedEvidence: debug?.unusedEvidence ?? [],
    determinismPassed: true,
  };
}
