import fs from 'node:fs';
import path from 'node:path';

type Finding = {
  file: string;
  reason: string;
  matches: string[];
};

function toPosix(p: string) {
  return p.replace(/\\/g, '/');
}

function isIgnoredFile(relPosix: string) {
  if (!relPosix.startsWith('apps/api/src/')) return true;
  if (relPosix.endsWith('.d.ts')) return true;
  if (!relPosix.endsWith('.ts')) return true;

  // ignore tests / specs
  if (relPosix.endsWith('.spec.ts')) return true;
  if (relPosix.endsWith('.e2e.spec.ts')) return true;

  // ignore known test/fixture utility areas
  if (relPosix.includes('/__test-utils__/')) return true;
  if (relPosix.includes('/__fixtures__/')) return true;
  if (relPosix.includes('/fixtures/')) return true;
  if (relPosix.includes('/test/')) return true;
  if (relPosix.includes('/tests/')) return true;

  // ignore generated-like outputs
  if (relPosix.includes('/generated/')) return true;
  if (relPosix.includes('/__generated__/')) return true;

  return false;
}

function walkFiles(rootAbs: string): string[] {
  const out: string[] = [];
  const stack: string[] = [rootAbs];
  while (stack.length) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (entry.isFile()) out.push(abs);
    }
  }
  return out;
}

describe('AUTHORITY GUARD: scoreCxFitV2 imports are restricted', () => {
  it('allows direct scoreCxFitV2 imports only from approved production modules', () => {
    const repoRoot = path.resolve(__dirname, '../../../../');
    const srcRoot = path.join(repoRoot, 'apps', 'api', 'src');

    const allowlist = new Set<string>([
      'apps/api/src/analysis/fit-scoring.service.ts',
      'apps/api/src/preview/preview-canonical-fit-score.service.ts',
      'apps/api/src/reality-check/reality-check.service.ts',
    ]);

    const files = walkFiles(srcRoot)
      .map((abs) => toPosix(path.relative(repoRoot, abs)))
      .filter((rel) => !isIgnoredFile(rel));

    const findings: Finding[] = [];

    // This is a lightweight guard, not a full TS parser. It detects explicit imports/requires
    // of scoreCxFitV2 from the canonical scorer module.
    const importRe =
      /(?:^|\n)\s*import\s*\{[^}]*\bscoreCxFitV2\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/g;
    const requireRe =
      /(?:^|\n)\s*(?:const|let|var)\s*\{[^}]*\bscoreCxFitV2\b[^}]*\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;

    for (const rel of files) {
      if (allowlist.has(rel)) continue;
      const abs = path.join(repoRoot, rel);
      let text = '';
      try {
        text = fs.readFileSync(abs, 'utf8');
      } catch {
        continue;
      }

      const matches: string[] = [];
      for (const re of [importRe, requireRe]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          const spec = m[1] ?? '';
          if (spec.includes('cx-fit-scoring-v2')) {
            matches.push(`${spec}`);
          }
        }
      }

      if (matches.length) {
        findings.push({
          file: rel,
          reason:
            'Direct import/require of scoreCxFitV2 is not allowed outside the allowlist (use FitScoringService facade).',
          matches,
        });
      }
    }

    if (findings.length) {
      const formatted = findings
        .map(
          (f) =>
            `- ${f.file}\n  - ${f.reason}\n  - matches: ${f.matches
              .map((m) => JSON.stringify(m))
              .join(', ')}`,
        )
        .join('\n');
      throw new Error(
        [
          'Unauthorized direct imports of scoreCxFitV2 found.',
          'Allowlist:',
          ...Array.from(allowlist).map((p) => `- ${p}`),
          'Findings:',
          formatted,
        ].join('\n'),
      );
    }
  });
});

