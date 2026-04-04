import { Injectable } from '@nestjs/common';
import {
  BaselineIncludePolicy,
  BaselineSectionType,
} from './baseline-section.entity';

export interface ParsedSection {
  sectionType: BaselineSectionType;
  title: string | null;
  content: string;
  order: number;
  includePolicy?: BaselineIncludePolicy;
}

type ParseStrategy = 'rules' | 'llm';

interface HeadingMatch {
  sectionType: BaselineSectionType;
  title: string;
}

@Injectable()
export class BaselineParserService {
  parseBaseline(
    rawText: string,
    opts: { strategy?: ParseStrategy } = {},
  ): ParsedSection[] {
    const strategy = opts.strategy ?? 'rules';

    if (strategy === 'llm') {
      return this.parseWithLLM(rawText);
    }

    return this.parseWithRules(rawText);
  }

  parseWithRules(rawText: string): ParsedSection[] {
    const normalizedText = rawText.replace(/\r\n/g, '\n');
    const lines = normalizedText.split('\n');

    const sections: ParsedSection[] = [];
    let currentHeading: HeadingMatch | null = null;
    let buffer: string[] = [];

    const flushSection = (nextHeading: HeadingMatch | null, order: number) => {
      if (buffer.length === 0 && !nextHeading) {
        return;
      }

      const content = buffer.join('\n').trim();
      const headingToUse = currentHeading ?? nextHeading;

      sections.push({
        sectionType: headingToUse?.sectionType ?? BaselineSectionType.OTHER,
        title: headingToUse?.title ?? null,
        content: content || '',
        order,
      });
    };

    const headingMatches: { pattern: RegExp; type: BaselineSectionType }[] = [
      {
        pattern: /^(summary|professional summary|profile)\b/i,
        type: BaselineSectionType.SUMMARY,
      },
      {
        pattern: /^(experience|professional experience|work experience)\b/i,
        type: BaselineSectionType.EXPERIENCE,
      },
      {
        pattern: /^(projects?|programs?)\b/i,
        type: BaselineSectionType.PROJECT,
      },
      {
        pattern: /^(skills|technical skills|key skills)\b/i,
        type: BaselineSectionType.SKILLS,
      },
      {
        pattern: /^(education|academic background|training)\b/i,
        type: BaselineSectionType.EDUCATION,
      },
    ];

    const isHeadingLine = (line: string): HeadingMatch | null => {
      const trimmed = line.trim();
      if (!trimmed) {
        return null;
      }

      if (trimmed.length > 80) {
        return null;
      }

      for (const matcher of headingMatches) {
        if (matcher.pattern.test(trimmed)) {
          return {
            sectionType: matcher.type,
            title: this.normalizeHeading(trimmed),
          };
        }
      }

      return null;
    };

    lines.forEach((line) => {
      const heading = isHeadingLine(line);

      if (heading) {
        if (currentHeading) {
          flushSection(null, sections.length);
          buffer = [];
        } else if (buffer.length > 0) {
          sections.push({
            sectionType: BaselineSectionType.OTHER,
            title: null,
            content: buffer.join('\n').trim(),
            order: sections.length,
          });
          buffer = [];
        }
        currentHeading = heading;
      } else {
        buffer.push(line);
      }
    });

    if (buffer.length > 0 || currentHeading) {
      flushSection(null, sections.length);
    }

    if (sections.length === 0) {
      return [
        {
          sectionType: BaselineSectionType.OTHER,
          title: null,
          content: normalizedText.trim(),
          order: 0,
        },
      ];
    }

    return sections.map((section, index) => ({
      ...section,
      order: index,
    }));
  }

  parseWithLLM(rawText: string): ParsedSection[] {
    // TODO: Hook up LLM-based parsing for richer extraction (titles, dates, roles, etc.).
    return this.parseWithRules(rawText);
  }

  private normalizeHeading(heading: string): string {
    const trimmed = heading.trim();
    if (trimmed === trimmed.toUpperCase()) {
      return trimmed
        .toLowerCase()
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }

    return trimmed;
  }
}
