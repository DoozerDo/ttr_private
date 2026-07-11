import { GenericLanguageDetector } from './generic-language-detector';

function trimToText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export class ExecutiveSummaryComposer {
  private detector = new GenericLanguageDetector();

  compose(input: {
    positioningThesis?: string | null;
    experienceSnippets: string[];
    evidencePriorities?: string[] | null;
  }): {
    summary: string;
    genericLanguageFlags: ReturnType<GenericLanguageDetector['detect']>;
    source: 'authoritative_thesis' | 'inferred';
  } {
    const summary = trimToText(input.positioningThesis ?? '');
    return {
      summary,
      genericLanguageFlags: this.detector.detect(summary),
      source: summary ? 'authoritative_thesis' : 'inferred',
    };
  }
}
