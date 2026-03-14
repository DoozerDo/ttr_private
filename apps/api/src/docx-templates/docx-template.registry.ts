import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DocxTemplateDefinition, DocxTemplateKind, DocxTemplateKey } from './docx-template.types';

const templates: Map<DocxTemplateKind, Map<DocxTemplateKey, DocxTemplateDefinition<unknown>>> = new Map();

export const DEFAULT_RESUME_TEMPLATE_KEY = 'classic_professional_v1';
export const DEFAULT_COVER_LETTER_TEMPLATE_KEY = 'classic_professional_v1';

function normalizeTemplatesDir(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? resolve(trimmed) : null;
}

export function getTemplateDirectoryCandidates(): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];
  const add = (candidate?: string | null) => {
    if (!candidate) return;
    const normalized = normalizeTemplatesDir(candidate);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  add(process.env.TTR_TEMPLATES_DIR);
  add(resolve(process.cwd(), 'templates'));
  add(resolve(process.cwd(), 'apps', 'api', 'templates'));

  return candidates;
}

export function resolveTemplateFilePath(fileName: string): string {
  const normalizedFileName = (fileName ?? '').trim();
  if (!normalizedFileName) {
    throw new Error('Template file name is required.');
  }

  const triedPaths: string[] = [];
  for (const directory of getTemplateDirectoryCandidates()) {
    const candidatePath = resolve(directory, normalizedFileName);
    triedPaths.push(candidatePath);
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error(
    `Template file "${normalizedFileName}" was not found. Looked in: ${triedPaths.join(', ')}. ` +
      'Set TTR_TEMPLATES_DIR to override the templates directory.',
  );
}

export function loadTemplateFileBytes(fileName: string): Buffer {
  const templatePath = resolveTemplateFilePath(fileName);
  const buffer = readFileSync(templatePath);
  if (!buffer.byteLength) {
    throw new Error(`Template file "${templatePath}" is empty.`);
  }
  return buffer;
}

export function registerDocxTemplate<TModel>(definition: DocxTemplateDefinition<TModel>) {
  const kindTemplates = templates.get(definition.kind) ?? new Map();
  kindTemplates.set(definition.key, definition as DocxTemplateDefinition<unknown>);
  templates.set(definition.kind, kindTemplates);
}

export function getDocxTemplate<TModel>(kind: DocxTemplateKind, key: DocxTemplateKey): DocxTemplateDefinition<TModel> {
  const kindTemplates = templates.get(kind);
  if (!kindTemplates) {
    throw new Error(`No templates registered for kind ${kind}`);
  }
  const template = kindTemplates.get(key);
  if (!template) {
    throw new Error(`Template ${key} not found for kind ${kind}`);
  }
  return template as DocxTemplateDefinition<TModel>;
}
