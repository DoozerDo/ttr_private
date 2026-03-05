import { getDocxTemplate, loadTemplateFileBytes, registerDocxTemplate } from '../../docx-template.registry';
import {
  DocxRenderContextBase,
  DocxTemplateDefinition,
  DocxTemplateKey,
  ResumeDocxModel,
} from '../../docx-template.types';

const templateKey: DocxTemplateKey = 'resume_v1';
const fileName = 'TTR_Resume_Template_v1.docx';
const fallbackTemplateKey: DocxTemplateKey = 'classic_professional_v1';

const template: DocxTemplateDefinition<ResumeDocxModel> = {
  kind: 'resume',
  key: templateKey,
  sourceType: 'docx',
  async render(model: ResumeDocxModel, context: DocxRenderContextBase) {
    // Ensure the file-based template is present in both dev and prod layouts.
    loadTemplateFileBytes(fileName);
    const fallbackTemplate = getDocxTemplate<ResumeDocxModel>(
      'resume',
      fallbackTemplateKey,
    );
    return fallbackTemplate.render(model, context);
  },
};

registerDocxTemplate(template);
