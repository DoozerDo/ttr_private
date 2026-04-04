#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const tolerance = 0.01;

const bundleSelectors = [
  { label: 'fit_score_debug', resolve: (data) => data.fit_score_debug },
  { label: 'fitScoreDebug', resolve: (data) => data.fitScoreDebug },
  { label: 'debug.bundle', resolve: (data) => data.debug?.bundle },
  { label: 'debug_bundle', resolve: (data) => data.debug_bundle },
  { label: 'debug.fit_score_debug', resolve: (data) => data.debug?.fit_score_debug },
  { label: 'debug', resolve: (data) => data.debug },
  { label: 'bundle', resolve: (data) => data.bundle },
  { label: '<root>', resolve: (data) => data },
];

function looksLikeBundle(value) {
  if (!value || typeof value !== 'object') return false;
  const hasBaselineId =
    typeof value.baselineId === 'string' || typeof value.baseline_id === 'string';
  const hasJobId = typeof value.jobId === 'string' || typeof value.job_id === 'string';
  const dimensionScores =
    (value.dimensionScores && typeof value.dimensionScores === 'object') ||
    (value.dimension_scores && typeof value.dimension_scores === 'object');
  const hasDimensions = Boolean(dimensionScores);
  const totalScore =
    typeof value.totalScore === 'number'
      ? value.totalScore
      : typeof value.total_score === 'number'
      ? value.total_score
      : null;
  return Boolean(hasBaselineId && hasJobId && hasDimensions && typeof totalScore === 'number');
}

function extractBundle(data) {
  for (const entry of bundleSelectors) {
    const candidate = entry.resolve(data);
    if (looksLikeBundle(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeBundle(bundle, sourceLabel) {
  const dimensionScores = bundle.dimensionScores ?? bundle.dimension_scores ?? {};
  const truncation =
    bundle.truncation ?? bundle.truncationReport ?? bundle.truncation_report ?? {};
  const normalized = {
    baselineId: bundle.baselineId ?? bundle.baseline_id ?? null,
    jobId: bundle.jobId ?? bundle.job_id ?? null,
    baselineHash:
      bundle.baselineHash ??
      bundle.baseline_hash ??
      bundle.baselineVersionHash ??
      bundle.baseline_version_hash ??
      null,
    jobHash:
      bundle.jobHash ??
      bundle.job_hash ??
      bundle.jobRawTextSha256 ??
      bundle.job_raw_text_sha256 ??
      null,
    dimensionScores: dimensionScores ?? {},
    totalScore:
      bundle.totalScore ?? bundle.total_score ?? bundle.total ?? bundle.score ?? null,
    truncation,
    math: typeof bundle.math === 'object' ? bundle.math : null,
  };

  const hasDimensions = Object.keys(normalized.dimensionScores).length > 0;
  if (!normalized.baselineId && !normalized.jobId && !hasDimensions) {
    console.error(`Top-level keys for ${sourceLabel}: ${Object.keys(bundle).join(', ')}`);
    throw new Error('Unrecognized debug bundle shape');
  }

  return normalized;
}

function loadBundle(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  const candidate = extractBundle(data);

  if (!candidate) {
    console.error(`Top-level keys: ${Object.keys(data).join(', ')}`);
    console.error(`Attempted selectors: ${bundleSelectors.map((entry) => entry.label).join(', ')}`);
    throw new Error(`No fit score debug bundle found in ${filePath}`);
  }

  return candidate;
}

function compareHashes(a, b, notes) {
  let missingHash = false;
  if (!a.baselineHash || !b.baselineHash) {
    missingHash = true;
  } else if (a.baselineHash !== b.baselineHash) {
    notes.push(`Baseline hash differs: ${a.baselineHash} vs ${b.baselineHash}`);
  }

  if (!a.jobHash || !b.jobHash) {
    missingHash = true;
  } else if (a.jobHash !== b.jobHash) {
    notes.push(`Job hash differs: ${a.jobHash} vs ${b.jobHash}`);
  }

  return missingHash;
}

function compareTruncation(a, b, notes) {
  const leftTrunc = a.truncation ?? {};
  const rightTrunc = b.truncation ?? {};
  const hasLeft = Object.keys(leftTrunc).length > 0;
  const hasRight = Object.keys(rightTrunc).length > 0;
  if (!hasLeft && !hasRight) return;

  ['baseline', 'job'].forEach((subject) => {
    const left = leftTrunc[subject];
    const right = rightTrunc[subject];
    if (!left && !right) {
      return;
    }
    if (!left || !right) {
      notes.push(
        `${subject} truncation presence differs: ${left ? 'first only' : 'second only'}`,
      );
      return;
    }

    if (
      left.originalChars !== right.originalChars ||
      left.finalChars !== right.finalChars ||
      left.truncated !== right.truncated ||
      left.threshold !== right.threshold
    ) {
      notes.push(
        `${subject} truncation differs (original/final/threshold/flag): ` +
          `${left.originalChars ?? 'n/a'}/${left.finalChars ?? 'n/a'}/${left.threshold ?? 'n/a'}/${left.truncated ?? 'n/a'} vs ` +
          `${right.originalChars ?? 'n/a'}/${right.finalChars ?? 'n/a'}/${right.threshold ?? 'n/a'}/${right.truncated ?? 'n/a'}`,
      );
    }
  });
}

function valueDiffers(left, right) {
  if (typeof left !== 'number' || typeof right !== 'number') return left !== right;
  return Math.abs(left - right) > tolerance;
}

function compareWeightsAndPenalties(a, b, notes) {
  if (!a.math || !b.math) return;
  const leftWeights = a.math.weights ?? {};
  const rightWeights = b.math.weights ?? {};
  const weightKeys = new Set([...Object.keys(leftWeights), ...Object.keys(rightWeights)]);
  weightKeys.forEach((key) => {
    const left = leftWeights[key];
    const right = rightWeights[key];
    if (valueDiffers(left, right)) {
      notes.push(`Weight ${key} differs: ${left ?? 'undefined'} vs ${right ?? 'undefined'}`);
    }
  });

  const leftPenalties = canonicalizePenalties(a.math.penalties);
  const rightPenalties = canonicalizePenalties(b.math.penalties);
  if (leftPenalties !== rightPenalties) {
    notes.push(
      `Penalties differ: ${leftPenalties || '<none>'} vs ${rightPenalties || '<none>'}`,
    );
  }
}

function canonicalizePenalties(penalties) {
  if (!penalties?.length) return '';
  return penalties
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((entry) => `${entry.code}:${entry.points}`)
    .join('|');
}

function compareDimensionPoints(a, b, notes) {
  const leftDimensions = a.dimensionScores ?? {};
  const rightDimensions = b.dimensionScores ?? {};
  const keys = new Set([
    ...Object.keys(leftDimensions),
    ...Object.keys(rightDimensions),
  ]);
  keys.forEach((key) => {
    const left = leftDimensions[key];
    const right = rightDimensions[key];
    if (valueDiffers(left, right)) {
      notes.push(
        `Dimension ${key} differs: ${typeof left === 'number' ? left.toFixed(2) : left ?? 'n/a'} vs ${typeof right === 'number' ? right.toFixed(2) : right ?? 'n/a'}`,
      );
    }
  });
}

function compareFinalRounding(a, b, notes) {
  const leftMethod = a.math?.roundingMethod;
  const rightMethod = b.math?.roundingMethod;
  if (leftMethod && rightMethod && leftMethod !== rightMethod) {
    notes.push(`Rounding method differs: ${leftMethod} vs ${rightMethod}`);
  }

  if (
    typeof a.totalScore === 'number' &&
    typeof b.totalScore === 'number' &&
    valueDiffers(a.totalScore, b.totalScore)
  ) {
    notes.push(`Final rounded score differs: ${a.totalScore} vs ${b.totalScore}`);
  }
}

function buildDiffReport(bundleA, bundleB) {
  const notes = [];
  const hashWarning = compareHashes(bundleA, bundleB, notes);
  compareTruncation(bundleA, bundleB, notes);
  compareWeightsAndPenalties(bundleA, bundleB, notes);
  compareDimensionPoints(bundleA, bundleB, notes);
  compareFinalRounding(bundleA, bundleB, notes);
  return { notes, hashWarning };
}

function ensureBundle(value, label) {
  if (!value) {
    throw new Error(`Missing ${label} debug bundle data`);
  }
}

const [fileA, fileB] = process.argv.slice(2);
if (!fileA || !fileB) {
  console.error(
    'Usage: node scripts/diff-fit-debug.js <bundleA.json> <bundleB.json> (accepts /analysis/run responses or extracted debug bundles saved from window.__r.debug)',
  );
  process.exit(1);
}

try {
  const bundleA = loadBundle(fileA);
  const bundleB = loadBundle(fileB);

  ensureBundle(bundleA, 'first');
  ensureBundle(bundleB, 'second');

  const normalizedA = normalizeBundle(bundleA, fileA);
  const normalizedB = normalizeBundle(bundleB, fileB);
  const { notes: diffs, hashWarning } = buildDiffReport(normalizedA, normalizedB);

  if (diffs.length) {
    console.log('Differences detected (tolerance 0.01):');
    diffs.forEach((msg) => console.log(`- ${msg}`));
    process.exitCode = 1;
  } else {
    console.log('No relevant differences detected (within tolerance).');
  }

  if (hashWarning) {
    console.log(
      'Note: baselineHash/jobHash missing in one or both bundles; compared available fields only.',
    );
  }
} catch (error) {
  console.error('Failed to compare debug bundles:', error.message);
  process.exit(1);
}
