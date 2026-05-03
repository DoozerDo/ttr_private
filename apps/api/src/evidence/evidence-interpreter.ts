import type { InterpretedEvidence } from './evidence-model';
import type { EvidenceConstraint, EvidenceItem, MissingElement } from './evidence-model';

export type EvidenceInterpreterInput = {
  baselineId: string;
  baselineVersionId: string;
  resumeText: string;
};

type ParsedLineContext = {
  skills: string[];
};

function normalizeWhitespace(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function splitLines(text: string): string[] {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length > 0);
}

function isSectionHeader(line: string): boolean {
  const lowered = line.toLowerCase();
  return (
    lowered === 'experience' ||
    lowered === 'skills' ||
    lowered === 'education' ||
    lowered === 'projects' ||
    lowered === 'projects / other' ||
    lowered === 'summary' ||
    lowered === 'notes'
  );
}

function parseSkills(lines: string[]): string[] {
  const skills: string[] = [];
  let inSkills = false;
  for (const line of lines) {
    if (line.toLowerCase() === 'skills') {
      inSkills = true;
      continue;
    }
    if (inSkills && isSectionHeader(line)) break;
    if (!inSkills) continue;
    // Accept comma-separated skills.
    for (const token of line.split(',').map((t) => normalizeWhitespace(t)).filter(Boolean)) {
      skills.push(token);
    }
  }
  return Array.from(new Set(skills));
}

function extractExplicitMetrics(text: string): string[] {
  const metrics: string[] = [];
  const lowered = text.toLowerCase();
  // Percentages like "35%".
  for (const match of lowered.matchAll(/\b\d{1,3}(?:\.\d+)?\s*%/g)) {
    metrics.push(match[0].replace(/\s+/g, ''));
  }
  // Multipliers like "2x".
  for (const match of lowered.matchAll(/\b\d+(?:\.\d+)?\s*x\b/g)) {
    metrics.push(match[0].replace(/\s+/g, ''));
  }
  // p95/p99 etc with number (keep conservative: only capture when explicitly formatted with pXX and a percent exists elsewhere).
  // (No additional inference beyond raw token capture.)
  if (/\bp\d{2}\b/.test(lowered)) {
    const token = (lowered.match(/\bp\d{2}\b/) ?? [])[0];
    if (token) metrics.push(token);
  }
  return Array.from(new Set(metrics));
}

function extractToolsFromUsingClause(text: string): string[] {
  const match = text.match(/\busing\s+([^.;]+)/i);
  if (!match) return [];
  const tail = match[1] ?? '';
  return tail
    .split(/,|and/gi)
    .map((t) => normalizeWhitespace(t))
    .filter(Boolean)
    .slice(0, 12);
}

function extractExplicitTools(text: string, context: ParsedLineContext): string[] {
  const fromUsing = extractToolsFromUsingClause(text);
  const lowered = text.toLowerCase();
  const explicitVocabulary = Array.from(
    new Set([
      ...context.skills,
      // Common explicit tool tokens that often appear outside a formal Skills section.
      'React',
      'Node.js',
      'TypeScript',
      'PostgreSQL',
      'AWS',
      'Docker',
    ]),
  ).filter(Boolean);
  const fromVocabulary = explicitVocabulary.filter((tool) => tool && lowered.includes(tool.toLowerCase()));
  return Array.from(new Set([...fromUsing, ...fromVocabulary]));
}

function inferActionAndDomain(text: string): { action: string | null; domain: string | null; outcome: string | null } {
  const normalized = normalizeWhitespace(text);
  const lowered = normalized.toLowerCase();

  // Very small, conservative parsing: we only split/label; we do not infer any new facts.
  // Action: first verb phrase up to "using"/"by"/"to"/"." where possible.
  const splitOn = /\b(?:using|by|to)\b/i;
  const parts = normalized.split(splitOn);
  const actionPart = normalizeWhitespace(parts[0] ?? '');
  const action = actionPart.length ? actionPart : null;

  // Domain: detect a few explicit domains from the sentence itself (no inference).
  let domain: string | null = null;
  if (/\bbackend\b/.test(lowered) || /\bservices?\b/.test(lowered)) domain = 'backend services';
  if (/\bescalation\b/.test(lowered) || /\bincident\b/.test(lowered)) domain = domain ?? 'incident response / escalation workflows';
  if (/\bfrontend\b/.test(lowered) || /\breact\b/.test(lowered)) domain = domain ?? 'frontend components';

  // Outcome: explicit outcome phrases like "improved X" or "reduced Y" (only if present).
  let outcome: string | null = null;
  if (/\bimproved\b/.test(lowered)) outcome = 'improved';
  if (/\breduced\b/.test(lowered)) outcome = 'reduced';
  if (/\bincreased\b/.test(lowered)) outcome = 'increased';

  return { action, domain, outcome };
}

function classifyEvidence(opts: {
  text: string;
  extracted: EvidenceItem['extracted'];
  tools: string[];
  metrics: string[];
}): Pick<EvidenceItem, 'evidenceStrength' | 'supportLevel' | 'generationUse' | 'missingElements' | 'constraints'> {
  const normalized = normalizeWhitespace(opts.text);
  const lowered = normalized.toLowerCase();
  const missing: MissingElement[] = [];

  const hasAction = Boolean(opts.extracted?.action && String(opts.extracted.action).trim().length > 0);
  const hasTools = opts.tools.length > 0;
  const hasMetrics = opts.metrics.length > 0;
  const hasExplicitOutcomeWord = Boolean(opts.extracted?.outcome);

  if (!hasTools) missing.push('tools');
  if (!hasMetrics) missing.push('metrics');
  if (!hasExplicitOutcomeWord) missing.push('outcome');
  if (!/\b(20\d{2}|19\d{2})\b/.test(lowered) && !/\b(?:present|current)\b/.test(lowered)) missing.push('timeframe');

  // Vague / generic patterns (weak or unusable).
  const isVagueResponsibility =
    /\bresponsible for\b/.test(lowered) ||
    /\bvarious\b/.test(lowered) ||
    /\bmisc\b/.test(lowered) ||
    /\bhelped with\b/.test(lowered);

  const isEmptyFiller =
    normalized.length < 6 ||
    ['n/a', 'na', '-', '—'].includes(lowered) ||
    /\bteam player\b/.test(lowered) ||
    /\bhard worker\b/.test(lowered);

  // Some inputs (including test fixtures and occasionally ingestion artifacts) include explicit "baseline context"
  // padding to satisfy extracted-text thresholds. This is intentionally non-specific and must never be treated
  // as usable evidence.
  const isBaselinePaddingFiller =
    /\badditional verified baseline context\b/.test(lowered) ||
    /\bverified professional experience context\b/.test(lowered);

  const baseConstraints: EvidenceConstraint[] = [
    'no_invented_metrics',
    'no_inferred_scope',
    'no_inferred_tools',
    'no_inferred_leadership',
  ];

  if (!hasAction || isEmptyFiller || isBaselinePaddingFiller) {
    return {
      evidenceStrength: 'unusable',
      supportLevel: 'none',
      generationUse: 'do_not_use',
      missingElements: Array.from(new Set(missing)),
      constraints: baseConstraints,
    };
  }

  if (isVagueResponsibility && !hasTools && !hasMetrics) {
    return {
      evidenceStrength: 'weak',
      supportLevel: 'contextual',
      generationUse: 'positioning_only',
      missingElements: Array.from(new Set(missing)),
      constraints: [...baseConstraints, 'use_constrained_language_only'],
    };
  }

  // Strong: explicit measurable impact OR explicit outcome plus clear action.
  if (hasMetrics || (hasExplicitOutcomeWord && hasTools)) {
    return {
      evidenceStrength: 'strong',
      supportLevel: 'direct',
      generationUse: 'use_directly',
      missingElements: Array.from(new Set(missing.filter((m) => m !== 'metrics'))),
      constraints: baseConstraints,
    };
  }

  // Partial: clear action/domain, but missing metrics/outcome.
  return {
    evidenceStrength: 'partial',
    supportLevel: 'partial',
    generationUse: 'use_with_constraints',
    missingElements: Array.from(new Set(missing)),
    constraints: [...baseConstraints, 'use_constrained_language_only'],
  };
}

function buildEvidenceId(parts: { baselineId: string; baselineVersionId: string; index: number }): string {
  return `evidence:${parts.baselineId}:${parts.baselineVersionId}:${parts.index}`;
}

export function interpretEvidenceFromResumeText(input: EvidenceInterpreterInput): InterpretedEvidence {
  const lines = splitLines(input.resumeText);
  const context: ParsedLineContext = { skills: parseSkills(lines) };

  const candidateLines = lines.filter((line) => !isSectionHeader(line));

  const items: EvidenceItem[] = [];
  let index = 0;
  for (const line of candidateLines) {
    // Skip likely headers (company/title/date lines). We do not infer companies/titles/dates in Phase 3.
    if (/\b\d{4}\b/.test(line) && line.includes('|')) continue;
    if (/\b(?:senior|engineer|developer|manager|director)\b/i.test(line) && line.includes('|')) continue;

    const tools = extractExplicitTools(line, context);
    const metrics = extractExplicitMetrics(line);
    const inferred = inferActionAndDomain(line);
    const extracted: EvidenceItem['extracted'] = {
      action: inferred.action,
      domain: inferred.domain,
      tools: tools.length ? tools : null,
      outcome: inferred.outcome,
      metrics: metrics.length ? metrics : null,
      scope: null,
      timeframe: null,
    };

    const classification = classifyEvidence({ text: line, extracted, tools, metrics });
    items.push({
      id: buildEvidenceId({ baselineId: input.baselineId, baselineVersionId: input.baselineVersionId, index }),
      text: line,
      evidenceStrength: classification.evidenceStrength,
      evidenceSource: 'inferred_from_resume_text',
      supportLevel: classification.supportLevel,
      missingElements: classification.missingElements,
      generationUse: classification.generationUse,
      extracted,
      constraints: classification.constraints,
    });
    index += 1;
  }

  const summary = items.reduce(
    (acc, item) => {
      if (item.evidenceStrength === 'strong') acc.strongEvidenceCount += 1;
      if (item.evidenceStrength === 'partial') acc.partialEvidenceCount += 1;
      if (item.evidenceStrength === 'weak') acc.weakEvidenceCount += 1;
      if (item.evidenceStrength === 'unusable') acc.unusableEvidenceCount += 1;
      return acc;
    },
    {
      strongEvidenceCount: 0,
      partialEvidenceCount: 0,
      weakEvidenceCount: 0,
      unusableEvidenceCount: 0,
    },
  );

  return { items, summary };
}
