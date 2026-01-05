import { createHash } from 'crypto';
import { ComplianceService } from './compliance.service';
import {
  ComplianceAction,
  ComplianceFlagCode,
  ComplianceFlagSeverity,
} from './compliance.types';
import { BaselineSectionType } from '../baseline/baseline-section.entity';

const buildAuditRepo = () => {
  const create = jest.fn((payload) => payload);
  const save = jest.fn(async (payload) => ({ id: 'audit-1', ...payload }));

  return { create, save };
};

describe('ComplianceService', () => {
  const repoMock = buildAuditRepo();
  const service = new ComplianceService(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: manual repository injection
    repoMock,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes validation when baseline hash and job company are present', async () => {
    const baselineVersion = { hash: 'baseline-hash' };
    const job = { company: 'ExampleCo', rawDescription: 'Job description' };

    const result = await service.validateAndAudit({
      action: ComplianceAction.RESUME_GENERATION,
      actorId: 'user-1',
      baselineVersion,
      job,
      outputHash: 'out-123',
    });

    expect(result.blocked).toBe(false);
    expect(result.complianceFlags).toHaveLength(0);
    expect(repoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        action: ComplianceAction.RESUME_GENERATION,
        baselineVersionHash: 'baseline-hash',
        jobHash: createHash('sha256').update('Job description').digest('hex'),
        outputHash: 'out-123',
        passFail: true,
      }),
    );
  });

  it('fails validation when baseline hash is missing', async () => {
    const job = { company: 'ExampleCo', rawDescription: 'Job description' };

    const result = await service.validateAndAudit({
      action: ComplianceAction.RESUME_GENERATION,
      actorId: 'user-1',
      baselineVersion: { hash: null },
      job,
    });

    expect(result.blocked).toBe(true);
    expect(result.complianceFlags).toEqual([
      expect.objectContaining({ code: ComplianceFlagCode.MISSING_BASELINE_HASH }),
    ]);
    expect(repoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        passFail: false,
      }),
    );
  });

  it('returns multiple flags when more than one condition fails', async () => {
    const job = { company: '', rawDescription: 'Job description' };

    const result = await service.validateAndAudit({
      action: ComplianceAction.RESUME_GENERATION,
      actorId: 'user-2',
      baselineVersion: { hash: null },
      job,
    });

    const codes = result.complianceFlags.map((flag) => flag.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        ComplianceFlagCode.MISSING_BASELINE_HASH,
        ComplianceFlagCode.UNKNOWN_COMPANY,
      ]),
    );
    expect(result.blocked).toBe(true);
  });

  it('blocks invented metrics when generated output includes numbers not in baseline', () => {
    const flags = service.enforceResumeWritingRules({
      baselineSections: [{ content: 'Improved uptime by 10%' }],
      generatedSections: [{ content: 'Improved uptime by 25%' }],
    });

    expect(flags).toEqual([
      expect.objectContaining({
        code: ComplianceFlagCode.INVENTED_METRIC,
        severity: ComplianceFlagSeverity.BLOCK,
      }),
    ]);
  });

  it('blocks stylized punctuation in generated output', () => {
    const flags = service.enforceResumeWritingRules({
      baselineSections: [{ content: 'Baseline text with 5 metrics and ExampleCo.' }],
      generatedSections: [{ content: 'Result—delivered improvements at ExampleCo' }],
    });

    expect(flags).toEqual([
      expect.objectContaining({
        code: ComplianceFlagCode.STYLIZED_PUNCTUATION,
        severity: ComplianceFlagSeverity.BLOCK,
      }),
    ]);
  });

  it('normalizes stylized punctuation for downstream output', () => {
    const normalized = service.normalizeSectionsForOutput([
      { title: 'Impact—Summary', content: 'Led teams… increased revenue by 1,200%' },
    ]);

    expect(normalized[0]).toEqual(
      expect.objectContaining({
        title: 'Impact-Summary',
        content: 'Led teams... increased revenue by 1,200%',
      }),
    );
  });

  it('blocks invented metrics with formatted numbers', () => {
    const flags = service.enforceResumeWritingRules({
      baselineSections: [{ content: 'Increased adoption to 1,200 users.' }],
      generatedSections: [{ content: 'Increased adoption to 1,500 users.' }],
    });

    expect(flags).toEqual([
      expect.objectContaining({
        code: ComplianceFlagCode.INVENTED_METRIC,
        severity: ComplianceFlagSeverity.BLOCK,
      }),
    ]);
  });

  it('allows technologies present in baseline vocabulary', () => {
    const flags = service.enforceResumeWritingRules({
      baselineSections: [
        {
          title: 'Skills',
          content: 'AWS, PostgreSQL, Terraform',
          sectionType: BaselineSectionType.SKILLS,
        },
      ],
      generatedSections: [{ content: 'Led AWS migration with PostgreSQL.' }],
    });

    expect(flags.find((flag) => flag.code === ComplianceFlagCode.FICTIONAL_TECHNOLOGY)).toBeUndefined();
  });

  it('blocks technologies not present in baseline', () => {
    const flags = service.enforceResumeWritingRules({
      baselineSections: [
        {
          title: 'Skills',
          content: 'AWS, PostgreSQL',
          sectionType: BaselineSectionType.SKILLS,
        },
      ],
      generatedSections: [{ content: 'Implemented QuantumOS pipelines.' }],
    });

    expect(flags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: ComplianceFlagCode.FICTIONAL_TECHNOLOGY, severity: ComplianceFlagSeverity.BLOCK }),
      ]),
    );
  });

  it('is conservative and avoids over-flagging generic terms', () => {
    const flags = service.enforceResumeWritingRules({
      baselineSections: [
        {
          title: 'Experience',
          content: 'AWS migration and platform leadership.',
          sectionType: BaselineSectionType.EXPERIENCE,
        },
      ],
      generatedSections: [{ content: 'Collaborated with cross-functional teams to improve processes.' }],
    });

    expect(flags.find((flag) => flag.code === ComplianceFlagCode.FICTIONAL_TECHNOLOGY)).toBeUndefined();
  });
});
