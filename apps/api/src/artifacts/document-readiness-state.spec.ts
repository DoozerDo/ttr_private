import { resolveDocumentReadinessState } from '@shared/documentReadinessState';

describe('resolveDocumentReadinessState (canonical)', () => {
  const baseGenerated = (overrides: any) => ({
    generationState: 'generated_usable',
    exportReady: true,
    qualityGate: { status: 'pass', reasons: [] },
    correctionReasons: [],
    qualityStatus: 'pass',
    ...overrides,
  });

  it('critique strong + contract failed => generated_unusable', () => {
    const result = resolveDocumentReadinessState({
      resumeArtifact: baseGenerated({ qualityGate: { status: 'needs_refinement', reasons: ['real_document_contract_failed'] }, exportReady: false }),
      coverLetterArtifact: baseGenerated({ qualityGate: { status: 'pass', reasons: [] } }),
      critiqueResult: { readiness: 'strong' } as any,
      qualityGate: null,
      exportReady: null,
      generationState: null,
    });
    expect(result.state).toBe('generated_unusable');
    expect(result.reasons).toEqual(expect.arrayContaining(['real_document_contract_failed']));
  });

  it('exportReady=true but real_document_contract_failed => generated_unusable', () => {
    const result = resolveDocumentReadinessState({
      resumeArtifact: baseGenerated({ qualityGate: { status: 'pass', reasons: ['real_document_contract_failed'] }, exportReady: true }),
      coverLetterArtifact: baseGenerated({ qualityGate: { status: 'pass', reasons: [] }, exportReady: true }),
      critiqueResult: { readiness: 'ready' } as any,
      qualityGate: null,
      exportReady: null,
      generationState: null,
    });
    expect(result.state).toBe('generated_unusable');
  });

  it('generation succeeded but weak quality => needs_refinement', () => {
    const result = resolveDocumentReadinessState({
      resumeArtifact: baseGenerated({ exportReady: false, qualityGate: { status: 'needs_refinement', reasons: ['summary_too_thin'] } }),
      coverLetterArtifact: baseGenerated({ exportReady: false, qualityGate: { status: 'needs_refinement', reasons: ['cover_contract:missing_structure'] } }),
      critiqueResult: null,
      qualityGate: null,
      exportReady: null,
      generationState: null,
    });
    expect(result.state).toBe('needs_refinement');
  });

  it('successful exportable artifacts => ready', () => {
    const result = resolveDocumentReadinessState({
      resumeArtifact: baseGenerated({}),
      coverLetterArtifact: baseGenerated({}),
      critiqueResult: null,
      qualityGate: null,
      exportReady: null,
      generationState: null,
    });
    expect(result.state).toBe('ready');
  });

  it('failed generation => failed', () => {
    const result = resolveDocumentReadinessState({
      resumeArtifact: baseGenerated({ generationState: 'generation_failed', qualityStatus: 'failed', exportReady: false }),
      coverLetterArtifact: baseGenerated({}),
      critiqueResult: { readiness: 'ready' } as any,
      qualityGate: null,
      exportReady: null,
      generationState: null,
    });
    expect(result.state).toBe('failed');
  });

  it('missing artifacts => missing', () => {
    const result = resolveDocumentReadinessState({
      resumeArtifact: null,
      coverLetterArtifact: null,
      critiqueResult: null,
      qualityGate: null,
      exportReady: null,
      generationState: null,
    });
    expect(result.state).toBe('missing');
  });
});
