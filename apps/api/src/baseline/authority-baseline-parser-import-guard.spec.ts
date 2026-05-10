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

  // ignore docs
  if (relPosix.endsWith('.md')) return true;

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

describe('AUTHORITY GUARD: BaselineParserService imports are restricted', () => {
  it('allows BaselineParserService imports only via BaselineIngestionService (and module wiring)', () => {
    const repoRoot = path.resolve(__dirname, '../../../../');
    const srcRoot = path.join(repoRoot, 'apps', 'api', 'src');

    const allowlist = new Set<string>([
      // canonical production orchestrator
      'apps/api/src/baseline/baseline-ingestion.service.ts',
      // Nest module wiring
      'apps/api/src/baseline/baseline.module.ts',
      // type-only import is allowed
      'apps/api/src/baseline/baseline.service.ts',
    ]);

    const files = walkFiles(srcRoot)
      .map((abs) => toPosix(path.relative(repoRoot, abs)))
      .filter((rel) => !isIgnoredFile(rel));

    const findings: Finding[] = [];

    const importFromRe =
      /(?:^|\n)\s*import\s+(type\s+)?[^;]*\s+from\s+['"]([^'"]+)['"]/g;
    const requireRe =
      /(?:^|\n)\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;

    function isParserSpecifier(spec: string) {
      if (!spec) return false;
      return (
        spec === './baseline-parser.service' ||
        spec.endsWith('/baseline/baseline-parser.service') ||
        spec.endsWith('/baseline/baseline-parser.service.ts') ||
        spec.endsWith('/baseline-parser.service') ||
        spec.endsWith('/baseline-parser.service.ts')
      );
    }

    for (const rel of files) {
      const abs = path.join(repoRoot, rel);
      let text = '';
      try {
        text = fs.readFileSync(abs, 'utf8');
      } catch {
        continue;
      }

      const matches: string[] = [];

      importFromRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = importFromRe.exec(text))) {
        const isTypeOnly = Boolean(m[1]);
        const spec = (m[2] ?? '').trim();
        if (!isParserSpecifier(spec)) continue;

        // type-only imports are allowed (they don't create runtime authority bypasses)
        if (isTypeOnly) continue;

        matches.push(spec);
      }

      requireRe.lastIndex = 0;
      while ((m = requireRe.exec(text))) {
        const spec = (m[1] ?? '').trim();
        if (isParserSpecifier(spec)) matches.push(spec);
      }

      if (!matches.length) continue;
      if (allowlist.has(rel)) continue;

      findings.push({
        file: rel,
        reason:
          'Direct BaselineParserService imports are not allowed outside BaselineIngestionService/module wiring. Route parsing through BaselineIngestionService to keep strategy authority centralized.',
        matches,
      });
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
          'Unauthorized BaselineParserService imports found.',
          'Allowlist:',
          ...Array.from(allowlist).map((p) => `- ${p}`),
          'Findings:',
          formatted,
        ].join('\n'),
      );
    }
  });
});

