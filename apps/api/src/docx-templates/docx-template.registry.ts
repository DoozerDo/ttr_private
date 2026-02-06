import type { DocxTemplateDefinition, DocxTemplateKind, DocxTemplateKey } from './docx-template.types';

const templates: Map<DocxTemplateKind, Map<DocxTemplateKey, DocxTemplateDefinition<unknown>>> = new Map();

export const DEFAULT_RESUME_TEMPLATE_KEY = 'classic_professional_v1';
export const DEFAULT_COVER_LETTER_TEMPLATE_KEY = 'classic_professional_v1';

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
