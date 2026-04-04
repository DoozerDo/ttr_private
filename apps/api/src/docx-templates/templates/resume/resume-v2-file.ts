import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import {
  loadTemplateFileBytes,
  registerDocxTemplate,
} from '../../docx-template.registry';
import {
  DocxRenderContextBase,
  DocxTemplateDefinition,
  DocxTemplateKey,
  ResumeDocxModel,
} from '../../docx-template.types';
import { mapResumeDocxModelToV2TemplateModel } from '../../mappers/resume-docx-model-to-v2-template-model';

const templateKey: DocxTemplateKey = 'resume_v2';
const fileName = 'TTR_Resume_Template_v2.docx';

const template: DocxTemplateDefinition<ResumeDocxModel> = {
  kind: 'resume',
  key: templateKey,
  sourceType: 'docx',
  async render(model: ResumeDocxModel, _context: DocxRenderContextBase) {
    const templateBytes = loadTemplateFileBytes(fileName);
    const zip = new PizZip(templateBytes);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: {
        start: '{{',
        end: '}}',
      },
    });

    doc.render(mapResumeDocxModelToV2TemplateModel(model));

    const buffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    return { buffer: Buffer.from(buffer) };
  },
};

registerDocxTemplate(template);
