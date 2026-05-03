import { BaselineIncludePolicy, BaselineSectionType, type BaselineSection } from '../../baseline/baseline-section.entity';

/**
 * Deterministic “Dalen-style” baseline fixture:
 * - Has real technical evidence (tools + one explicit metric)
 * - Includes malformed headers that often break structured experience extraction
 * - Includes enough supporting text to avoid insufficient-extracted-text rejection in tests
 */
export function buildDalenDeterministicBaselineSections(): BaselineSection[] {
  // Keep this highly alphabetic to avoid extracted-text heuristics misclassifying the preview as OCR noise.
  const padding =
    'Verified professional experience in software engineering, backend systems, and cross functional collaboration. '.repeat(
      80,
    );

  return [
    {
      id: 'summary-1',
      sectionType: BaselineSectionType.SUMMARY,
      title: 'Summary',
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 0,
      content: [
        'Backend engineer with experience building and maintaining services and collaborating cross-functionally.',
        padding,
      ].join('\n'),
    } as any,
    {
      id: 'experience-1',
      sectionType: BaselineSectionType.EXPERIENCE,
      title: 'Experience',
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 1,
      content: [
        // Malformed header noise (breaks strict template parsing)
        // Still malformed, but avoid symbol-heavy junk that can reduce alphabetic ratio in extracted-text heuristics.
        'Vue 3 deck builder frontend',
        'Professional Experience',
        '2021 - Present',
        '- Built and maintained backend services using Node.js, PostgreSQL, and AWS.',
        '- Improved p95 API latency by 35% by optimizing database queries and caching.',
        '',
        // Additional vague line that should not unlock anything on its own
        '- Responsible for various engineering tasks.',
        '',
        padding,
      ].join('\n'),
    } as any,
    {
      id: 'skills-1',
      sectionType: BaselineSectionType.SKILLS,
      title: 'Skills',
      includePolicy: BaselineIncludePolicy.ALWAYS,
      order: 2,
      content: 'Node.js, PostgreSQL, AWS',
    } as any,
  ];
}
