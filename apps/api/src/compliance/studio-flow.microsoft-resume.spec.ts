import { BaselineSectionType } from '../baseline/baseline-section.entity';
import { ComplianceService } from './compliance.service';
import {
  ComplianceAction,
  ComplianceFlagCode,
  DocumentType,
  GeneratedTextSourceType,
} from './compliance.types';

const buildAuditRepo = () => {
  const create = jest.fn((payload) => payload);
  const save = jest.fn(async (payload) => ({
    id: 'audit-microsoft-flow',
    createdAt: new Date(),
    ...payload,
  }));
  return { create, save };
};

describe('studio flow microsoft/chris resume regression', () => {
  const repoMock = buildAuditRepo();
  const embeddingServiceMock = {
    embed: jest.fn(async (text: string) => {
      const normalized = text.toLowerCase();
      if (
        normalized.includes('department') &&
        normalized.includes('mobile test') &&
        normalized.includes('resources')
      ) {
        return [0.93, 0.07, 0.12];
      }
      if (
        normalized.includes('department') &&
        normalized.includes('mobile test') &&
        normalized.includes('infrastructure')
      ) {
        return [0.92, 0.08, 0.11];
      }
      if (
        normalized.includes('eaiops') ||
        normalized.includes('100k') ||
        normalized.includes('50 plus labs')
      ) {
        return [0.88, 0.12, 0.15];
      }
      return [0.12, 0.18, 0.09];
    }),
  };

  const service = new ComplianceService(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore manual repository injection for unit tests
    repoMock,
    embeddingServiceMock as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps microsoft/chris style supported scope claims clear while suppressing malformed invented-role fragments', async () => {
    const baselineSections = [
      {
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content:
          'Led turnaround of a department responsible for all mobile test resources encompassing about 50,000 devices. Assigned to take over an EAIOps team supporting Windows test resources spanning 100K plus devices and 50 plus labs.',
      },
    ];

    const generatedSections = [
      {
        title: 'Experience',
        content:
          'Led a department managing mobile test infrastructure and cross team engineering efforts.',
        sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        sentenceSources: [
          {
            text: 'Led a department managing mobile test infrastructure and cross team engineering efforts.',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
          {
            text: 'Senior Lead IT Engineer on the',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
        ],
      },
    ];

    const scopeFlags = await service.detectScopeInflation({
      baselineSections,
      generatedSections,
      documentType: DocumentType.RESUME,
    });

    expect(scopeFlags).toHaveLength(0);
    expect(JSON.stringify(scopeFlags)).not.toContain(
      'extreme_scale_without_baseline_match',
    );

    const result = await service.validateAndAudit({
      action: ComplianceAction.RESUME_GENERATION,
      actorId: 'user-microsoft-flow',
      baselineVersion: { id: 'baseline-v-ms', hash: 'hash-ms' } as any,
      outputHash: 'output-hash-ms',
      baselineSections,
      generatedSections,
      extraFlags: scopeFlags,
      documentType: DocumentType.RESUME,
    });

    expect(result.blocked).toBe(false);
    expect(result.complianceFlags).toEqual([]);
    expect(result.complianceFlags.map((flag) => flag.code)).not.toContain(
      ComplianceFlagCode.SCOPE_INFLATION,
    );
    expect(result.complianceFlags.map((flag) => flag.code)).not.toContain(
      ComplianceFlagCode.INVENTED_ROLE,
    );
  });

  it('uses sentence claim units when sentenceSources are present instead of paragraph blobs', async () => {
    const baselineSections = [
      {
        sectionType: BaselineSectionType.EXPERIENCE,
        title: 'Experience',
        content:
          'Led turnaround of a department responsible for all mobile test resources encompassing about 50,000 devices.',
      },
    ];

    const paragraphBlob =
      'This narrative includes broad context and filler. Led a department managing mobile test infrastructure. Additional prose that should not be used as one giant semantic blob.';

    const generatedSections = [
      {
        title: 'Experience',
        content: paragraphBlob,
        sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
        sentenceSources: [
          {
            text: 'Led a department managing mobile test infrastructure.',
            sourceType: GeneratedTextSourceType.BASELINE_EVIDENCE,
          },
        ],
      },
    ];

    const flags = await service.detectScopeInflation({
      baselineSections,
      generatedSections,
      documentType: DocumentType.RESUME,
    });

    expect(flags).toHaveLength(0);
    const calls = embeddingServiceMock.embed.mock.calls.map(([text]) =>
      String(text),
    );
    expect(
      calls.some((text) => text.includes(paragraphBlob.slice(0, 40))),
    ).toBe(false);
    expect(
      calls.some((text) =>
        text.includes('Led a department managing mobile test infrastructure.'),
      ),
    ).toBe(true);
  });
});
