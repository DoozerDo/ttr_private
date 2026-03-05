import './templates';
import {
  getDocxTemplate,
  loadTemplateFileBytes,
  resolveTemplateFilePath,
} from './docx-template.registry';

describe('docx template registry file loader', () => {
  it('registers resume_v2 and loads non-empty template bytes', () => {
    const template = getDocxTemplate('resume', 'resume_v2');
    expect(template).toBeDefined();

    const templatePath = resolveTemplateFilePath('TTR_Resume_Template_v2.docx');
    expect(templatePath).toContain('templates');

    const bytes = loadTemplateFileBytes('TTR_Resume_Template_v2.docx');
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('throws an explicit error when a template is missing', () => {
    const previous = process.env.TTR_TEMPLATES_DIR;
    process.env.TTR_TEMPLATES_DIR = `${process.cwd()}/definitely-missing-templates-dir`;

    try {
      expect(() => resolveTemplateFilePath('missing-template.docx')).toThrow(
        /Looked in:/,
      );
      expect(() => resolveTemplateFilePath('missing-template.docx')).toThrow(
        /TTR_TEMPLATES_DIR/,
      );
    } finally {
      if (previous === undefined) {
        delete process.env.TTR_TEMPLATES_DIR;
      } else {
        process.env.TTR_TEMPLATES_DIR = previous;
      }
    }
  });
});
