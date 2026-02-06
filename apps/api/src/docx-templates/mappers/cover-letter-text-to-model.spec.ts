import { mapCoverLetterTextToModel } from './cover-letter-text-to-model';

describe('cover letter mapper', () => {
  it('splits paragraphs and keeps greeting', () => {
    const text = `Dear Hiring Team,

I appreciate the opportunity.

Regards,
Jane Doe`;
    const model = mapCoverLetterTextToModel(text);
    expect(model.greeting).toBe('Dear Hiring Team,');
    expect(model.paragraphs).toContain('I appreciate the opportunity.');
    expect(model.closingLines?.[0]).toBe('Regards,');
    expect(model.signatureName).toBe('Jane Doe');
  });
});
