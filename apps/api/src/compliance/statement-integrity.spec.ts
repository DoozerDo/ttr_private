import { GeneratedTextSourceType } from './compliance.types';
import { validateStatementIntegrity } from './statement-integrity';

describe('validateStatementIntegrity', () => {
  it('rejects dangling role fragments', () => {
    const result = validateStatementIntegrity(
      'Senior Lead IT Engineer on the',
      { sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('dangling_connective_phrase');
  });

  it('rejects capability phrase fragments', () => {
    const result = validateStatementIntegrity(
      'leadership scope and incident management programs',
      { sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('capability_phrase');
  });

  it('rejects technical depth highlights narrative fragments', () => {
    const result = validateStatementIntegrity(
      'technical depth highlights systems',
      { sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('capability_phrase');
  });

  it('rejects recommendation fragments', () => {
    const result = validateStatementIntegrity('Recommended for this role', {
      sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects projects within fragment', () => {
    const result = validateStatementIntegrity('projects within the group', {
      sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects helping design fragment', () => {
    const result = validateStatementIntegrity('helping design', {
      sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects lowercased certification fragment', () => {
    const result = validateStatementIntegrity(
      'certification of wireless networking and client-side home networking technologies.',
      { sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE },
    );
    expect(result.valid).toBe(false);
  });

  it('allows asserted role statements', () => {
    const result = validateStatementIntegrity(
      'Served as Vice President of Global Support',
      { sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE },
    );
    expect(result.valid).toBe(true);
  });

  it('allows worked as assertions', () => {
    const result = validateStatementIntegrity(
      'Worked as Chief Customer Officer',
      { sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE },
    );
    expect(result.valid).toBe(true);
  });

  it('allows currently working as assertions', () => {
    const result = validateStatementIntegrity(
      'Currently working as a Senior Network Infrastructure Engineer.',
      { sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE },
    );
    expect(result.valid).toBe(true);
  });

  it('allows standalone role titles', () => {
    const result = validateStatementIntegrity('Senior Lead IT Engineer', {
      sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
    });
    expect(result.valid).toBe(true);
    expect(result.standaloneRoleTitle).toBe(true);
  });

  it('allows Software Development Engineer in Test title', () => {
    const result = validateStatementIntegrity(
      'Software Development Engineer in Test',
      { sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE },
    );
    expect(result.valid).toBe(true);
    expect(result.standaloneRoleTitle).toBe(true);
  });

  it('allows Senior Network Infrastructure Engineer title', () => {
    const result = validateStatementIntegrity(
      'Senior Network Infrastructure Engineer',
      { sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE },
    );
    expect(result.valid).toBe(true);
    expect(result.standaloneRoleTitle).toBe(true);
  });
});
