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

describe('AUTHORITY GUARD: compliance detectors imports are restricted', () => {
  it('allows direct imports from compliance/detectors only from ComplianceService', () => {
    const repoRoot = path.resolve(__dirname, '../../../../');
    const srcRoot = path.join(repoRoot, 'apps', 'api', 'src');

    const allowlist = new Set<string>([
      'apps/api/src/compliance/baseline-allowlist.ts',
      'apps/api/src/compliance/compliance.service.ts',
    ]);

    const files = walkFiles(srcRoot)
      .map((abs) => toPosix(path.relative(repoRoot, abs)))
      .filter((rel) => !isIgnoredFile(rel));

    const findings: Finding[] = [];

    // Lightweight guard (not a TS parser): detect import/require specifiers that target detectors.
    const importFromRe =
      /(?:^|\n)\s*import\s+(?:type\s+)?[^;]*\s+from\s+['"]([^'"]+)['"]/g;
    const bareImportRe =
      /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
    const requireRe =
      /(?:^|\n)\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;

    function isDetectorsSpecifier(spec: string) {
      if (!spec) return false;
      // Match both relative imports within compliance folder and any path that ends in /compliance/detectors.
      return (
        spec === './detectors' ||
        spec === '../compliance/detectors' ||
        spec.endsWith('/compliance/detectors') ||
        spec.endsWith('/compliance/detectors.ts') ||
        spec.endsWith('/detectors') ||
        spec.endsWith('/detectors.ts')
      );
    }

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
      for (const re of [importFromRe, bareImportRe, requireRe]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          const spec = (m[1] ?? '').trim();
          if (isDetectorsSpecifier(spec)) matches.push(spec);
        }
      }

      if (matches.length) {
        findings.push({
          file: rel,
          reason:
            'Direct imports from compliance/detectors are not allowed outside ComplianceService. Use ComplianceService APIs instead.',
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
          'Unauthorized direct imports from compliance/detectors found.',
          'Allowlist:',
          ...Array.from(allowlist).map((p) => `- ${p}`),
          'Findings:',
          formatted,
        ].join('\n'),
      );
    }
  });
});
