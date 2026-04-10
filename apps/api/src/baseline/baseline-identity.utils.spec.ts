import { resolveBaselineIdentity } from './baseline-identity.utils';

describe('resolveBaselineIdentity', () => {
  it('falls back to the first person-like line in baseline sections when parsed records are absent', () => {
    const identity = resolveBaselineIdentity({
      id: 'baseline-1',
      userId: 'user-1',
      versionNumber: 1,
      originalFilename: 'baseline-v23.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      storagePath: '/tmp/baseline-v23.docx',
      hash: 'hash-1',
      status: 'ACTIVE',
      isActive: true,
      sections: [
        {
          id: 'raw',
          baselineId: 'baseline-1',
          sectionType: 'RAW',
          title: 'Raw',
          content: 'Morgan Lee\n\nSummary\nSupport operations leader.',
          includePolicy: 'NEVER',
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      parsedRecords: [],
      archivedAt: null,
      originalBaselineScore: null,
      latestBaselineScore: null,
      latestAssessmentId: null,
      firstAnalyzedAt: null,
      lastAnalyzedAt: null,
      isSynthetic: true,
      syntheticScenarioKey: 'support-ops-director-strong-fit',
      syntheticRunId: null,
      syntheticCreatedAt: null,
      preserveFromCleanup: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    expect(identity?.fullName).toBe('Morgan Lee');
  });
});
