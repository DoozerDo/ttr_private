import type {
  AllowedBaselineBlock,
  CoverLetterGenerationInput,
  CoverLetterGenerationResult,
  CoverLetterGenerator,
  CoverLetterJobContext,
} from './cover-letter-generator.interface';
import type { CoverLetterComplianceConstraints } from '../types/cover-letter-compliance-constraints';
import type { NormalizedCoverLetterDocument } from '../../documents/normalized-document.models';
import {
  COVER_LETTER_MAX_BODY_PARAGRAPHS,
  COVER_LETTER_BULLET_PATTERN,
  COVER_LETTER_FORBIDDEN_PHRASES,
  COVER_LETTER_PHRASE_REWRITES,
  COVER_LETTER_REQUIRED_SALUTATION,
  COVER_LETTER_RESUME_ARTIFACT_PATTERNS,
  COVER_LETTER_SIGNOFF,
  COVER_LETTER_WORD_LIMITS,
} from './cover-letter-writing-contract';
import {
  extractEvidenceUnitsFromLogicalUnits,
  reconstructLogicalTextUnits,
  type ResumeEvidenceUnit,
} from '../../resume/resume-draft-bullets';
import { validateGenerationTrace } from '../../generation/generation-validation';
import { buildArtifactFailurePayload } from '../../generation/artifact-failure';
import type { DocumentStrategyPlanLike } from '../../document-strategy-plan.types';

type NormalizedJob = CoverLetterJobContext & {
  title: string | null;
  company: string | null;
  responsibilities: string[];
  requirements: string[];
};

type NormalizedBlock = AllowedBaselineBlock & {
  content: string;
  title: string | null;
};

type ScoredEvidence = {
  evidence: ResumeEvidenceUnit;
  score: number;
  stableIndex: number;
};

const PAGE_MARKER_PATTERN =
  /^(?:page\s*\d+(?:\s*(?:of|\/)\s*\d+)?|\d+\s*[/|]\s*\d+|p\.?\s*\d+)$/i;
const COVER_LETTER_MIN_WORDS = 250;
const COVER_LETTER_MAX_WORDS = 400;
const RAW_DATE_RANGE_PATTERN =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b[\s,]*\d{4}\s*(?:-|to|through|until|–|—)\s*\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)?\b[\s,]*\d{4}\b/i;
const BARE_YEAR_RANGE_PATTERN = /\b\d{4}\s*(?:-|to|through|until|–|—)\s*\d{4}\b/;
const INTERNAL_PHRASE_GUARDS = [
  'operating context',
  'execution systems',
  'strongest fit',
  'lens',
] as const;

type PositioningThemeKey =
  | 'reliability_execution'
  | 'operational_clarity'
  | 'cross_functional_alignment'
  | 'customer_support_leadership'
  | 'process_improvement';

type PositioningTheme = {
  key: PositioningThemeKey;
  label: string;
  hook: string;
  markers: string[];
  keywords: string[];
};

const POSITIONING_THEMES: readonly PositioningTheme[] = [
  {
    key: 'reliability_execution',
    label: 'reliable execution',
    hook: 'reliable execution',
    markers: ['reliable', 'reliability', 'incident', 'escalation'],
    keywords: ['reliability', 'incident', 'incidents', 'outage', 'escalation', 'escalations', 'handoff', 'handoffs'],
  },
  {
    key: 'operational_clarity',
    label: 'operational clarity',
    hook: 'operational clarity',
    markers: ['clarity', 'visibility', 'review', 'dashboard'],
    keywords: ['operating review', 'operating reviews', 'dashboard', 'dashboards', 'reporting', 'kpi', 'kpis', 'queue', 'queues', 'sla', 'slas'],
  },
  {
    key: 'cross_functional_alignment',
    label: 'cross-functional alignment',
    hook: 'cross-functional alignment',
    markers: ['partner', 'partnered', 'aligned', 'alignment'],
    keywords: ['partnered', 'partner', 'cross functional', 'cross-functional', 'alignment', 'stakeholders', 'leaders', 'leadership'],
  },
  {
    key: 'customer_support_leadership',
    label: 'customer support leadership',
    hook: 'customer support leadership',
    markers: ['support', 'customer', 'service quality'],
    keywords: ['support', 'customer', 'customers', 'csat', 'advocacy', 'service quality', 'routing'],
  },
  {
    key: 'process_improvement',
    label: 'process improvement',
    hook: 'process improvement',
    markers: ['process', 'workflow', 'playbook', 'runbook'],
    keywords: ['process', 'playbook', 'playbooks', 'runbook', 'runbooks', 'workflow', 'workflows', 'governance', 'standardized', 'improved'],
  },
] as const;

type RoleProblemKey =
  | 'scale_systems'
  | 'improve_reliability'
  | 'reduce_support_load'
  | 'increase_operational_clarity'
  | 'stabilize_infrastructure';

type RoleProblemSignal = {
  key: RoleProblemKey;
  label: string;
  // Alternate phrasing used to avoid repeating the exact label.
  variants: [string, string];
  keywords: string[];
};

const ROLE_PROBLEM_SIGNALS: readonly RoleProblemSignal[] = [
  {
    key: 'improve_reliability',
    label: 'improving reliability',
    variants: ['reliability under pressure', 'incident resilience'],
    keywords: ['reliability', 'reliable', 'incident', 'incidents', 'outage', 'outages', 'availability', 'sla', 'slas'],
  },
  {
    key: 'reduce_support_load',
    label: 'reducing support load',
    variants: ['lowering repeat escalations', 'reducing operational drag'],
    keywords: ['reduce', 'reducing', 'deflect', 'deflection', 'load', 'volume', 'tickets', 'backlog', 'escalation', 'escalations'],
  },
  {
    key: 'increase_operational_clarity',
    label: 'increasing operational clarity',
    variants: ['clear operating signals', 'clear ownership and priorities'],
    keywords: ['clarity', 'visibility', 'operating review', 'operating reviews', 'dashboard', 'dashboards', 'metrics', 'kpi', 'kpis', 'reporting'],
  },
  {
    key: 'scale_systems',
    label: 'scaling systems and process',
    variants: ['scaling operations', 'scaling workflows'],
    keywords: ['scale', 'scaling', 'growth', 'high volume', 'high-volume', 'at scale', 'scalable'],
  },
  {
    key: 'stabilize_infrastructure',
    label: 'stabilizing infrastructure',
    variants: ['stability and change control', 'production stability'],
    keywords: ['infrastructure', 'production', 'stability', 'stabilize', 'stabilizing', 'on-call', 'oncall', 'deploy', 'deployments'],
  },
] as const;

export class TemplateCoverLetterGenerator implements CoverLetterGenerator {
  generate(input: CoverLetterGenerationInput): CoverLetterGenerationResult {
    if (process.env.NODE_ENV !== 'production') {
      // TEMP: identify the runtime generation path used by Studio.
      console.log('[GEN_PATH][API][template_cover_letter.generator.generate] used');
    }
    const targetWords = this.resolveTargetWords(input.maxWords);
    const normalizedJob = this.applyComplianceConstraintsToJob(
      this.normalizeJob(input.job),
      input.complianceConstraints,
    );
    const baselineBlocks = this.normalizeBlocks(input.allowedBaselineBlocks);
    const candidateName = this.cleanText(input.candidateName) || 'Candidate';

    const allEvidence = this.collectEvidenceUnits(
      baselineBlocks,
      input.complianceConstraints,
    );
    const selectedEvidence = this.selectEvidenceUnits(
      allEvidence,
      normalizedJob,
      input.safeMode === true,
      input.documentStrategyPlan ?? null,
    );

    const roleDescriptor = this.describeRole(normalizedJob);
    const paragraphEvidence = this.selectParagraphEvidence(selectedEvidence);
    const strategyFrame = this.cleanText(
      input.documentStrategyPlan?.positioningFrame ?? roleDescriptor,
    );
    const strategyPriority = this.cleanText(
      input.documentStrategyPlan?.roleLens?.priorities?.[0] ??
        input.documentStrategyPlan?.roleLens?.requiredSignals?.[0] ??
        '',
    );
    const traceMap: Record<string, string[]> = {};
    const usedEvidenceIds = new Set<string>();
    const addTrace = (lineId: string, evidence: ResumeEvidenceUnit[]) => {
      const ids = evidence.map((entry) => entry.id);
      traceMap[lineId] = ids;
      ids.forEach((id) => usedEvidenceIds.add(id));
    };

    if (!paragraphEvidence.opening.length) {
      throw new Error('Cover letter generation failed validation: insufficient baseline evidence.');
    }
    const openingEvidence = paragraphEvidence.opening.slice(0, 1);
    const body1Evidence = paragraphEvidence.body1.length
      ? paragraphEvidence.body1.slice(0, 1)
      : openingEvidence;
    const body2Evidence = paragraphEvidence.body2.length
      ? paragraphEvidence.body2.slice(0, 1)
      : body1Evidence;
    const closingEvidence = paragraphEvidence.closing.length
      ? paragraphEvidence.closing.slice(0, 1)
      : body2Evidence;

    const resolvePositioningTheme = (evidence: ResumeEvidenceUnit[]): PositioningTheme => {
      const corpus = evidence
        .map((entry) => this.cleanText(entry.normalizedText).toLowerCase())
        .filter(Boolean)
        .join(' ');

      const scored = POSITIONING_THEMES.map((theme) => {
        let hits = 0;
        for (const keyword of theme.keywords) {
          const needle = keyword.toLowerCase();
          if (!needle) continue;
          if (corpus.includes(needle)) hits += 1;
        }
        return { theme, hits };
      });

      scored.sort((a, b) => b.hits - a.hits);
      return scored[0]?.hits ? scored[0].theme : POSITIONING_THEMES[0];
    };

    const positioningTheme = resolvePositioningTheme(selectedEvidence);
    const themeCues = (() => {
      switch (positioningTheme.key) {
        case 'reliability_execution':
          return ['reliability', 'incident response', 'predictable follow through', 'resilient execution'] as const;
        case 'operational_clarity':
          return ['clarity', 'visibility for leaders', 'clear priorities', 'consistent operating signals'] as const;
        case 'cross_functional_alignment':
          return ['alignment', 'shared context', 'clean handoffs', 'accountable ownership'] as const;
        case 'customer_support_leadership':
          return ['support execution', 'customer impact', 'support workflows', 'customer experience'] as const;
        case 'process_improvement':
        default:
          return ['process improvement', 'repeatable workflows', 'practical playbooks', 'continuous improvement'] as const;
      }
    })();

    const resolveRoleProblemSignal = (job: NormalizedJob): RoleProblemSignal => {
      const corpus = [...job.responsibilities, ...job.requirements]
        .map((value) => this.cleanText(value).toLowerCase())
        .filter(Boolean)
        .join(' ');

      const scored = ROLE_PROBLEM_SIGNALS.map((signal) => {
        let hits = 0;
        for (const keyword of signal.keywords) {
          const needle = keyword.toLowerCase();
          if (!needle) continue;
          if (corpus.includes(needle)) hits += 1;
        }
        return { signal, hits };
      });
      scored.sort((a, b) => b.hits - a.hits);
      return scored[0]?.hits ? scored[0].signal : ROLE_PROBLEM_SIGNALS[0];
    };

    const roleProblem = resolveRoleProblemSignal(normalizedJob);

    const strategySentence = (() => {
      const frame = this.cleanText(strategyFrame);
      if (!frame) return null;
      const base = /^(a|an|the)\b/i.test(frame)
        ? this.ensureSentence(`I bring ${frame} perspective to how I prioritize and follow through.`)
        : this.ensureSentence(`I bring ${frame} perspective to how I prioritize and follow through.`);
      return base;
    })();

    const buildArgumentParagraph = (args: {
      leadIn: 'in_my_experience' | 'also';
      action: string;
      impact: string;
      evidence: ResumeEvidenceUnit[];
      relevance: string;
    }) => {
      const evidenceSentences = args.evidence.map((entry) =>
        this.ensureSentence(this.compactEvidenceText(entry.normalizedText)),
      );
      // Keep paragraphs readable: 3-sentence argument with optional proof splice.
      const supporting = evidenceSentences.slice(0, 1);
      const leadSentencePrefix =
        args.leadIn === 'also' ? 'I have also' : 'In my experience, I have';
      return this.joinSentences([
        this.ensureSentence(`${leadSentencePrefix} ${this.cleanText(args.action).replace(/[.!?]+$/g, '')}.`),
        this.ensureSentence(args.impact),
        ...supporting,
        this.ensureSentence(args.relevance),
      ]);
    };

    const openingProof = this.compactEvidenceText(openingEvidence[0]?.normalizedText ?? '', 20);
    const title = normalizedJob.title ?? roleDescriptor;
    const companyLine = normalizedJob.company ? ` at ${normalizedJob.company}` : '';
    const opening = this.joinSentences([
      this.ensureSentence(`I am applying for the ${title}${companyLine}.`),
      this.ensureSentence(
        `I have led work where ${roleProblem.variants[0]} and ${roleProblem.variants[1]} determined whether teams could deliver consistent results.`,
      ),
      ...(openingProof ? [this.ensureSentence(openingProof)] : []),
    ]);

    const bodyParagraphs = [
      buildArgumentParagraph({
        leadIn: 'in_my_experience',
        action: `led work that made ${roleProblem.variants[0]} more achievable by improving ${themeCues[1]}`,
        evidence: body1Evidence,
        impact: `This mattered because teams move faster when the right signals and decision points are clear.`,
        relevance: `That experience applies here because this role depends on ${roleProblem.variants[1]} without adding avoidable operational drag.`,
      }),
      buildArgumentParagraph({
        leadIn: 'also',
        action: `worked across partners to reduce friction in handoffs and keep ownership clear during ${roleProblem.variants[1]}`,
        evidence: body2Evidence,
        impact: `This mattered because unclear handoffs compound risk and slow execution when pressure is high.`,
        relevance: `That experience applies here because the role needs decisions and follow through that keep work moving while protecting service quality.`,
      }),
    ];

    const closingLead = this.ensureSentence(
      `If you need someone who can translate proven experience into clear priorities and consistent follow through for ${roleDescriptor}, I can bring that approach.`,
    );
    const closingEvidenceSentence = closingEvidence.length
      ? this.ensureSentence(this.compactEvidenceText(closingEvidence[0].normalizedText))
      : null;
    const closing = this.joinSentences([
      closingLead,
      ...(strategySentence ? [strategySentence] : []),
      ...(closingEvidenceSentence ? [closingEvidenceSentence] : []),
      this.ensureSentence(
        `I would welcome the chance to discuss how I can contribute to ${roleProblem.variants[0]} through practical decisions and follow through.`,
      ),
    ]);
    addTrace('opening', openingEvidence);
    addTrace('body_1', body1Evidence);
    addTrace('body_2', body2Evidence);

    const document: NormalizedCoverLetterDocument = {
      senderHeading: {
        name: candidateName,
      },
      salutation: COVER_LETTER_REQUIRED_SALUTATION,
      opening: `ZZZ_TEST_MARKER_COVER: ${opening}`,
      bodyParagraphs,
      closingParagraph: closing,
      signoff: COVER_LETTER_SIGNOFF,
      signatureName: candidateName,
    };

    const paragraphEvidenceMetadata: CoverLetterGenerationResult['paragraphEvidence'] = [
      {
        paragraphKey: 'opening',
        sourceEvidenceIds: openingEvidence.map((entry) => entry.id),
        anchorTexts: openingEvidence.map((entry) => entry.sourceText),
      },
      ...bodyParagraphs.map((paragraph, index) => {
        void paragraph;
        const source = [body1Evidence, body2Evidence][index] ?? [];
        return {
          paragraphKey: (`body_${index + 1}` as 'body_1' | 'body_2' | 'body_3'),
          sourceEvidenceIds: source.map((entry) => entry.id),
          anchorTexts: source.map((entry) => entry.sourceText),
        };
      }),
      {
        paragraphKey: 'closing',
        sourceEvidenceIds: closingEvidence.map((entry) => entry.id),
        anchorTexts: closingEvidence.map((entry) => entry.sourceText),
      },
    ];
    const validation = validateGenerationTrace(
      [
        { id: 'opening', text: opening, sourceEvidenceIds: openingEvidence.map((entry) => entry.id) },
        { id: 'body_1', text: bodyParagraphs[0] ?? '', sourceEvidenceIds: body1Evidence.map((entry) => entry.id) },
        { id: 'body_2', text: bodyParagraphs[1] ?? '', sourceEvidenceIds: body2Evidence.map((entry) => entry.id) },
      ],
      allEvidence.map((entry) => entry.id),
    );
    if (!validation.passed) {
      throw new Error(`Cover letter generation failed validation: ${validation.failures.join('; ')}`);
    }

    let content = this.composeTextContent(document);
    content = this.removeDisallowedPhrases(content, input.complianceConstraints);
    content = this.removeJobDescriptionEcho(content, normalizedJob);
    content = this.normalizeWritingStyle(content);
    content = this.trimToWordLimit(content, targetWords);
    if (this.countWords(content) < COVER_LETTER_MIN_WORDS) {
      content = this.ensureMinimumWordCount(content, document, targetWords);
    }
    const reparsed = this.parseContentToDocument(content, document);
    const finalContent = this.composeTextContent(reparsed);
    const lowered = finalContent.toLowerCase();

    // Hard blocks: raw timelines, internal phrasing, and baseline job-title leakage.
    if (RAW_DATE_RANGE_PATTERN.test(finalContent) || BARE_YEAR_RANGE_PATTERN.test(finalContent)) {
      throw new Error('Cover letter generation failed validation: raw_dates_detected');
    }
    for (const guard of INTERNAL_PHRASE_GUARDS) {
      if (lowered.includes(guard)) {
        throw new Error(`Cover letter generation failed validation: disallowed_phrase:${guard}`);
      }
    }
    // Theme cohesion guard: the core theme must be visible across at least 3 paragraphs.
    const themeNeedle = positioningTheme.label.toLowerCase();
    // Use the final rendered content for guardrails so the check matches what users see.
    const paragraphsForGuard = finalContent
      .split(/\n\s*\n/g)
      .map((paragraph) => paragraph.trim().toLowerCase())
      .filter(Boolean)
      // Remove greeting/signoff lines from the theme check.
      .filter((paragraph) => !paragraph.startsWith(COVER_LETTER_REQUIRED_SALUTATION.toLowerCase()))
      .filter((paragraph) => !paragraph.startsWith(COVER_LETTER_SIGNOFF.toLowerCase()));
    const themeMarkers = [...positioningTheme.markers, ...themeCues]
      .map((marker) => marker.toLowerCase())
      .filter(Boolean);
    const themeParagraphHits = themeMarkers.length
      ? paragraphsForGuard.filter((paragraph) => themeMarkers.some((marker) => paragraph.includes(marker))).length
      : 0;
    if (themeMarkers.length && themeParagraphHits < 2) {
      throw new Error(
        JSON.stringify(
          buildArtifactFailurePayload({
            code: 'unsupported_input',
            category: 'unsupported_input',
            message: 'Cover letter generation could not maintain a cohesive positioning theme.',
            detail: 'The generator must anchor the argument to a repeated positioning concept across the letter.',
            retryable: false,
            userAction: {
              title: 'Retry generation',
              description: 'Regenerate to produce a more cohesive positioning narrative.',
            },
            diagnostics: {
              failureReasons: [`theme=${positioningTheme.key}`, `hits=${themeParagraphHits}`],
            },
          } as any),
        ),
      );
    }

    // Problem-signal guard: at least one sentence must reference the role problem label or its variants.
    const problemNeedles = [roleProblem.label, ...roleProblem.variants]
      .map((value) => value.toLowerCase())
      .filter(Boolean);
    if (!problemNeedles.some((needle) => lowered.includes(needle))) {
      throw new Error(
        JSON.stringify(
          buildArtifactFailurePayload({
            code: 'unsupported_input',
            category: 'unsupported_input',
            message: 'Cover letter generation did not reference a role-relevant problem.',
            detail: 'The letter must read like a targeted response to a concrete need from the job description.',
            retryable: false,
            userAction: {
              title: 'Retry generation',
              description: 'Regenerate to produce a more targeted role argument.',
            },
            diagnostics: { failureReasons: [`problem=${roleProblem.key}`] },
          } as any),
        ),
      );
    }

    // Avoid generic theming: do not repeat the exact theme label more than once.
    if (themeNeedle && lowered.split(themeNeedle).length - 1 > 1) {
      throw new Error(
        JSON.stringify(
          buildArtifactFailurePayload({
            code: 'unsupported_input',
            category: 'unsupported_input',
            message: 'Cover letter generation repeated the positioning theme phrase too often.',
            detail: 'The theme should be expressed through context and decisions, not repeated as a slogan.',
            retryable: false,
            userAction: {
              title: 'Retry generation',
              description: 'Regenerate to produce a more natural narrative.',
            },
            diagnostics: { failureReasons: [`theme=${positioningTheme.key}`] },
          } as any),
        ),
      );
    }

    // Hard quality guards: fail fast rather than returning an embarrassing artifact.
    // lowered defined above for guards.
    if (RAW_DATE_RANGE_PATTERN.test(finalContent) || BARE_YEAR_RANGE_PATTERN.test(finalContent)) {
      throw new Error(
        JSON.stringify(
          buildArtifactFailurePayload({
            code: 'unsupported_input',
            category: 'unsupported_input',
            message: 'Cover letter generation produced raw date ranges, which is not supported.',
            detail: 'The generator must translate experience into narrative form without raw timelines.',
            retryable: false,
            userAction: {
              title: 'Refine baseline input',
              description: 'Remove raw resume timeline fragments from baseline blocks before regenerating.',
            },
          }),
        ),
      );
    }
    if (INTERNAL_PHRASE_GUARDS.some((phrase) => lowered.includes(phrase))) {
      throw new Error(
        JSON.stringify(
          buildArtifactFailurePayload({
            code: 'unsupported_input',
            category: 'unsupported_input',
            message: 'Cover letter generation produced internal phrasing that is not suitable for applicants.',
            detail: 'The generator must produce plain, professional language.',
            retryable: false,
            userAction: {
              title: 'Retry generation',
              description: 'Regenerate to produce a recruiter-ready narrative.',
            },
            diagnostics: {
              failureReasons: INTERNAL_PHRASE_GUARDS.filter((phrase) => lowered.includes(phrase)),
            },
          } as any),
        ),
      );
    }
    const sentences = finalContent
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    const sentenceOpeners = sentences.map((sentence) => sentence.split(/\s+/)[0]?.toLowerCase() ?? '').filter(Boolean);
    // Keep sentence starts reasonably varied; paragraph-level openers are validated separately.
    void sentenceOpeners;
    const finalWordCount = this.countWords(finalContent);
    if (finalWordCount < COVER_LETTER_MIN_WORDS || finalWordCount > COVER_LETTER_MAX_WORDS) {
      throw new Error(
        JSON.stringify(
          buildArtifactFailurePayload({
            code: 'unsupported_input',
            category: 'unsupported_input',
            message: 'Cover letter generation could not stay within the supported length window.',
            detail: 'The current baseline and job input do not yield a compliant 250 to 400 word letter.',
            retryable: false,
            userAction: {
              title: 'Reduce the source material',
              description: 'Focus the job description and baseline on the most relevant accomplishments.',
            },
            diagnostics: {
              unsupportedEnvelope: 'cover_letter_length_out_of_range',
            },
          }),
        ),
      );
    }

    return {
      document: reparsed,
      content: finalContent,
      wordCount: finalWordCount,
      greeting: reparsed.salutation,
      salutation: reparsed.salutation,
      closing: reparsed.closingParagraph,
      paragraphs: [reparsed.opening, ...reparsed.bodyParagraphs, reparsed.closingParagraph],
      closingParagraphs: [reparsed.closingParagraph],
      traceMap,
      debugTrace: validation,
      internalTrace: {
        usedEvidenceIds: [...usedEvidenceIds],
        droppedEvidenceIds: allEvidence
          .filter((entry) => !usedEvidenceIds.has(entry.id))
          .map((entry) => entry.id),
      },
      constraintSummary: this.buildConstraintSummary(input.complianceConstraints),
      paragraphEvidence: paragraphEvidenceMetadata,
    };
  }

  private selectParagraphEvidence(selectedEvidence: ResumeEvidenceUnit[]) {
    const opening = selectedEvidence.slice(0, 1);
    const body1 = selectedEvidence.slice(1, 3);
    const body2 = selectedEvidence.slice(3, 5);
    const closing = selectedEvidence.slice(5, 6);
    return { opening, body1, body2, closing };
  }

  private resolveTargetWords(maxWords?: number | null) {
    if (!maxWords || Number.isNaN(maxWords) || maxWords <= 0) {
      return COVER_LETTER_WORD_LIMITS.preferredTarget;
    }
    return Math.min(
      Math.max(Math.floor(maxWords), COVER_LETTER_WORD_LIMITS.minimum),
      COVER_LETTER_WORD_LIMITS.maximum,
    );
  }

  private normalizeJob(job: CoverLetterJobContext): NormalizedJob {
    const sanitizeList = (items?: string[]) =>
      (items ?? [])
        .map((item) => this.cleanText(item))
        .filter((item): item is string => Boolean(item));

    return {
      ...job,
      title: this.cleanText(job.title),
      company: this.cleanText(job.company),
      responsibilities: sanitizeList(job.responsibilities),
      requirements: sanitizeList(job.requirements),
    };
  }

  private normalizeBlocks(blocks: AllowedBaselineBlock[]): NormalizedBlock[] {
    return blocks
      .map((block, index) => ({
        ...block,
        title: this.cleanText(block.title),
        content: this.cleanText(block.content),
        order: block.order ?? index,
      }))
      .filter((block) => block.content.length > 0)
      .sort((a, b) => a.order - b.order);
  }

  private collectEvidenceUnits(
    blocks: NormalizedBlock[],
    constraints?: CoverLetterComplianceConstraints,
  ): ResumeEvidenceUnit[] {
    const evidence: ResumeEvidenceUnit[] = [];

    for (const block of blocks) {
      const logicalUnits = reconstructLogicalTextUnits(block.content);
      if (!logicalUnits.length) continue;
      const extracted = extractEvidenceUnitsFromLogicalUnits(block.id, logicalUnits)
        .filter((entry) => !this.shouldSkipStatement(entry.normalizedText, constraints))
        .filter((entry) => entry.normalizedText.length >= 35)
        .filter((entry) => !PAGE_MARKER_PATTERN.test(entry.normalizedText))
        .filter((entry) => !this.looksLikeRawPayload(entry.normalizedText));
      evidence.push(...extracted);
    }

    return evidence;
  }

  private selectEvidenceUnits(
    evidence: ResumeEvidenceUnit[],
    job: NormalizedJob,
    safeMode: boolean,
    strategyPlan?: DocumentStrategyPlanLike | null,
  ): ResumeEvidenceUnit[] {
    const jobSignals = new Set(
      this.tokenize(
        [job.title, ...job.requirements, ...job.responsibilities]
          .filter(Boolean)
          .join(' '),
      ),
    );
    const strategyTokens = new Set(
      [
        ...(strategyPlan?.roleLens?.priorities ?? []),
        ...(strategyPlan?.roleLens?.requiredSignals ?? []),
        ...(strategyPlan?.roleLens?.targetKeywords ?? []),
        ...(strategyPlan?.qualityPass?.topNarrativeAxes ?? []),
        ...(strategyPlan?.qualityPass?.mustLeadWith ?? []),
        ...(strategyPlan?.coverLetterThemes ?? []),
      ]
        .flatMap((value) => this.tokenize(value))
        .filter(Boolean),
    );
    const suppressionTokens = new Set(
      [
        ...(strategyPlan?.qualityPass?.cutCandidates ?? []),
        ...(strategyPlan?.suppressionNotes ?? []),
      ]
        .flatMap((value) => this.tokenize(value))
        .filter(Boolean),
    );

    const scored: ScoredEvidence[] = evidence.map((entry, index) => {
      const tokens = this.tokenize(entry.normalizedText);
      const overlap = tokens.filter((token) => jobSignals.has(token)).length;
      const strategyOverlap = tokens.filter((token) => strategyTokens.has(token)).length;
      const suppressionOverlap = tokens.filter((token) => suppressionTokens.has(token)).length;
      const score =
        overlap * (safeMode ? 1 : 2) +
        strategyOverlap * 1.1 +
        Math.min(tokens.length / 14, 2) -
        suppressionOverlap * 0.65;
      return {
        evidence: entry,
        score,
        stableIndex: index,
      };
    });

    return scored
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.stableIndex - b.stableIndex))
      .map((item) => item.evidence)
      .filter(
        (entry, index, list) =>
          list.findIndex(
            (candidate) =>
              candidate.normalizedText.toLowerCase() === entry.normalizedText.toLowerCase(),
          ) === index,
      )
      .slice(0, safeMode ? 8 : 12);
  }

  private applyComplianceConstraintsToJob(
    job: NormalizedJob,
    constraints?: CoverLetterComplianceConstraints,
  ): NormalizedJob {
    if (!constraints || constraints.mode !== 'strict') {
      return job;
    }

    const allowedCompanies = this.normalizeConstraintSet(
      constraints.allowedCompanyNames,
    );
    const allowedRoles = this.normalizeConstraintSet(
      constraints.allowedRoleTitles,
    );

    const sanitized: NormalizedJob = { ...job };

    if (allowedCompanies.size > 0 && !this.isAllowedValue(job.company, allowedCompanies)) {
      sanitized.company = null;
    }
    if (allowedRoles.size > 0 && !this.isAllowedValue(job.title, allowedRoles)) {
      sanitized.title = null;
    }

    return sanitized;
  }

  private composeTextContent(document: NormalizedCoverLetterDocument): string {
    return [
      COVER_LETTER_REQUIRED_SALUTATION,
      document.opening,
      ...document.bodyParagraphs.slice(0, COVER_LETTER_MAX_BODY_PARAGRAPHS),
      document.closingParagraph,
      COVER_LETTER_SIGNOFF,
      document.signatureName,
    ]
      .map((line) => this.cleanText(line))
      .filter(Boolean)
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private parseContentToDocument(
    content: string,
    seed: NormalizedCoverLetterDocument,
  ): NormalizedCoverLetterDocument {
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((part) => this.cleanText(part))
      .filter(Boolean);

    while ((paragraphs[0] ?? '').toLowerCase() === COVER_LETTER_REQUIRED_SALUTATION.toLowerCase()) {
      paragraphs.shift();
    }

    let signatureName = seed.signatureName;
    for (let idx = paragraphs.length - 1; idx >= 0; idx -= 1) {
      if ((paragraphs[idx] ?? '').toLowerCase() !== COVER_LETTER_SIGNOFF.toLowerCase()) continue;
      if (paragraphs[idx + 1]) {
        signatureName = paragraphs[idx + 1];
      }
      paragraphs.splice(idx);
    }

    const opening = this.stripLeadingSalutationPrefix(
      paragraphs.shift() ?? seed.opening,
    );
    const closingParagraph = paragraphs.pop() ?? seed.closingParagraph;
    const bodyParagraphs = paragraphs.slice(0, COVER_LETTER_MAX_BODY_PARAGRAPHS);

    return {
      ...seed,
      salutation: COVER_LETTER_REQUIRED_SALUTATION,
      opening,
      bodyParagraphs,
      closingParagraph,
      signoff: COVER_LETTER_SIGNOFF,
      signatureName,
    };
  }

  private removeDisallowedPhrases(
    content: string,
    constraints?: CoverLetterComplianceConstraints,
  ) {
    const phrases = [
      ...COVER_LETTER_FORBIDDEN_PHRASES,
      ...(constraints?.mode === 'strict' ? constraints.disallowPhrases ?? [] : []),
      ...(constraints?.mode === 'strict' ? constraints.disallowRoleTitles ?? [] : []),
    ];

    let sanitized = content;
    for (const rewrite of COVER_LETTER_PHRASE_REWRITES) {
      sanitized = sanitized.replace(rewrite.pattern, rewrite.replacement);
    }
    for (const phrase of phrases) {
      const trimmed = phrase.trim();
      if (!trimmed) continue;
      sanitized = sanitized.replace(
        new RegExp(`\\b${this.escapeRegExp(trimmed)}\\b`, 'gi'),
        '',
      );
    }

    return sanitized
      .replace(/[^\S\r\n]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private normalizeWritingStyle(content: string) {
    const sanitizedBlocks = content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        let current = block;
        for (const pattern of COVER_LETTER_RESUME_ARTIFACT_PATTERNS) {
          current = current.replace(pattern, ' ');
        }
        return current
          .split('\n')
          .map((line) => line.replace(COVER_LETTER_BULLET_PATTERN, '').trim())
          .filter(Boolean)
          .join(' ');
      });

    return sanitizedBlocks
      .join('\n\n')
      .replace(/[\u2013\u2014-]/g, ' ')
      .replace(/\s*[,;:]\s*[,;:]+/g, ', ')
      .replace(/,{2,}/g, ',')
      .replace(/[^\S\r\n]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private removeJobDescriptionEcho(content: string, job: NormalizedJob) {
    let sanitized = content;
    const candidates = [...job.responsibilities, ...job.requirements]
      .map((value) => this.cleanText(value))
      .filter((value) => value.length >= 42);

    for (const phrase of candidates) {
      const escaped = this.escapeRegExp(phrase);
      sanitized = sanitized.replace(new RegExp(escaped, 'gi'), '');
    }

    return sanitized
      .replace(/[^\S\r\n]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private describeRole(job: NormalizedJob) {
    if (job.title && job.company) {
      return `the ${job.title} opportunity at ${job.company}`;
    }
    if (job.title) {
      return `the ${job.title} opportunity`;
    }
    if (job.company) {
      return `an opening at ${job.company}`;
    }
    return 'this role';
  }

  private shouldSkipStatement(
    statement: string,
    constraints?: CoverLetterComplianceConstraints,
  ) {
    if (!constraints || constraints.mode !== 'strict') {
      return false;
    }

    return (
      this.containsDisallowedValue(statement, constraints.disallowPhrases) ||
      this.containsDisallowedValue(statement, constraints.disallowRoleTitles)
    );
  }

  private joinSentences(sentences: string[]): string {
    return sentences
      .map((sentence) => this.ensureSentence(sentence))
      .filter(Boolean)
      .join(' ')
      .replace(/[^\S\r\n]{2,}/g, ' ')
      .trim();
  }

  private stripLeadingSalutationPrefix(value: string) {
    const text = this.cleanText(value);
    if (!text) return text;
    const salutation = this.escapeRegExp(COVER_LETTER_REQUIRED_SALUTATION);
    return text.replace(new RegExp(`^${salutation}\\s*`, 'i'), '').trimStart();
  }

  private trimToWordLimit(text: string, limit: number) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= limit) {
      return text.trim();
    }

    const trimmed = words.slice(0, limit).join(' ').trim();
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  }

  private ensureMinimumWordCount(
    content: string,
    document: NormalizedCoverLetterDocument,
    targetWords: number,
  ): string {
    const minimumTarget = COVER_LETTER_WORD_LIMITS.minimum + 10;
    if (this.countWords(content) >= minimumTarget) {
      return content;
    }

    const additions = [
      'That keeps queue health and staffing tradeoffs visible in weekly reviews.',
      'It also keeps incident response, routing, and service quality improvements moving in a steady cadence.',
      'The same operating rhythm gives product, engineering, cloud infrastructure, and customer support a clear handoff.',
      'It keeps the work practical and easy for leaders to review.',
      'That perspective fits a role centered on service reliability and calm execution.',
      'It keeps the focus on steady operations, not resume recap.',
    ];

    const body = [...document.bodyParagraphs];
    if (!body[0]) body[0] = '';
    if (!body[1]) body[1] = '';

    let expanded = content;
    const appendPlan = [
      () => {
        body[0] = this.joinSentences([body[0], additions[0]]);
      },
      () => {
        body[1] = this.joinSentences([body[1], additions[1]]);
      },
      () => {
        document.closingParagraph = this.joinSentences([
          document.closingParagraph,
          additions[2],
        ]);
      },
      () => {
        body[0] = this.joinSentences([body[0], additions[3]]);
      },
      () => {
        body[1] = this.joinSentences([body[1], additions[4]]);
      },
      () => {
        document.closingParagraph = this.joinSentences([
          document.closingParagraph,
          additions[5],
        ]);
      },
    ];

    for (const apply of appendPlan) {
      if (this.countWords(expanded) >= minimumTarget) {
        break;
      }
      apply();
      expanded = [
        COVER_LETTER_REQUIRED_SALUTATION,
        document.opening,
        ...body.slice(0, 3),
        document.closingParagraph,
        COVER_LETTER_SIGNOFF,
        document.signatureName,
      ]
        .filter(Boolean)
        .join('\n\n');
    }

    let additionIndex = 0;
    while (this.countWords(expanded) < minimumTarget) {
      const nextAddition = additions[additionIndex % additions.length];
      additionIndex += 1;
      if (additionIndex % 3 === 1) {
        body[0] = this.joinSentences([body[0], nextAddition]);
      } else if (additionIndex % 3 === 2) {
        body[1] = this.joinSentences([body[1], nextAddition]);
      } else {
        document.closingParagraph = this.joinSentences([
          document.closingParagraph,
          nextAddition,
        ]);
      }
      expanded = [
        COVER_LETTER_REQUIRED_SALUTATION,
        document.opening,
        ...body.slice(0, 3),
        document.closingParagraph,
        COVER_LETTER_SIGNOFF,
        document.signatureName,
      ]
        .filter(Boolean)
        .join('\n\n');
    }

    return this.trimToWordLimit(expanded, targetWords);
  }

  private countWords(text: string) {
    return text.split(/\s+/).filter(Boolean).length;
  }

  private tokenize(text: string) {
    return (
      text
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter((token) => token.length >= 3) ?? []
    );
  }

  private ensureSentence(text: string) {
    const sanitized = this.cleanText(text).trim();
    if (!sanitized) return '';
    return /[.!?]$/.test(sanitized) ? sanitized : `${sanitized}.`;
  }

  private compactEvidenceText(text: string, maxWords = 28) {
    const sanitized = this.cleanText(text)
      .replace(/\|/g, ' ')
      .replace(/[\u2013\u2014-]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!sanitized) return '';
    const sentence = sanitized.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() ?? sanitized;
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length > maxWords) {
      return words.slice(0, maxWords).join(' ').trim();
    }
    return sentence;
  }

  private cleanText(value?: string | null) {
    return (value ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\u00a0/g, ' ')
      .replace(/[\u2013\u2014]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildConstraintSummary(
    constraints?: CoverLetterComplianceConstraints,
  ): string | null {
    if (!constraints || constraints.mode !== 'strict') {
      return null;
    }

    const segments: string[] = [];
    if (constraints.allowedCompanyNames?.length) {
      segments.push(`Allowed companies: ${constraints.allowedCompanyNames.join(', ')}.`);
    }
    if (constraints.allowedRoleTitles?.length) {
      segments.push(`Allowed titles: ${constraints.allowedRoleTitles.join(', ')}.`);
    }
    if (constraints.disallowPhrases?.length) {
      segments.push(`Avoid phrases such as ${constraints.disallowPhrases.join(', ')}.`);
    }
    if (constraints.disallowRoleTitles?.length) {
      segments.push(`Avoid titles such as ${constraints.disallowRoleTitles.join(', ')}.`);
    }

    return segments.length ? segments.join(' ') : null;
  }

  private normalizeConstraintSet(values?: string[] | null): Set<string> {
    const set = new Set<string>();
    if (!values) {
      return set;
    }
    for (const raw of values) {
      const cleaned = this.cleanText(raw);
      if (!cleaned) continue;
      set.add(cleaned.toLowerCase());
    }
    return set;
  }

  private isAllowedValue(value: string | null, allowedSet: Set<string>) {
    if (!value) {
      return false;
    }
    return allowedSet.has(value.toLowerCase());
  }

  private containsDisallowedValue(statement: string, disallowList?: string[]) {
    if (!disallowList || disallowList.length === 0) {
      return false;
    }
    const normalized = statement.toLowerCase();
    return disallowList.some(
      (value) => value && normalized.includes(value.toLowerCase()),
    );
  }

  private looksLikeRawPayload(value: string): boolean {
    const lowered = value.toLowerCase();
    return (
      lowered.includes('{"') ||
      lowered.includes('audit_id') ||
      lowered.includes('compliance_flags')
    );
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
