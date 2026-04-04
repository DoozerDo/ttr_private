import { BaselineSectionType } from '../baseline/baseline-section.entity';
import {
  buildBaselineEvidenceTermInventory,
  detectClaimRiskForBullet,
} from './claim-risk';

describe('claim risk detection', () => {
  const baselineSection = {
    id: 'section-1',
    sectionType: BaselineSectionType.EXPERIENCE,
    order: 0,
    title: 'Support Operations',
    content:
      'Led AWS migration and Datadog dashboard rollout for global support operations.',
  } as never;

  it('includes known terms from baseline sections in inventory', () => {
    const inventory = buildBaselineEvidenceTermInventory({
      sections: [baselineSection],
      baselineVersion: null,
    });

    expect(inventory.terms).toContain('aws');
    expect(inventory.sources.aws?.[0]).toContain('section:section-1');
  });

  it('flags a bullet term not present in baseline inventory', () => {
    const inventory = buildBaselineEvidenceTermInventory({
      sections: [baselineSection],
      baselineVersion: null,
    });

    const risk = detectClaimRiskForBullet(
      'Implemented Kubernetes observability workflows.',
      inventory,
    );

    expect(risk.level).toBe('High');
    expect(risk.flaggedTerms.some((term) => term.normalized === 'kubernetes')).toBe(
      true,
    );
  });

  it('does not flag a bullet term present in baseline inventory', () => {
    const inventory = buildBaselineEvidenceTermInventory({
      sections: [baselineSection],
      baselineVersion: null,
    });

    const risk = detectClaimRiskForBullet('Expanded Datadog alert coverage.', inventory);

    expect(risk.level).toBe('None');
    expect(risk.flaggedTerms).toHaveLength(0);
  });

  it('classifies high, medium, and low representative terms', () => {
    const inventory = buildBaselineEvidenceTermInventory({
      sections: [baselineSection],
      baselineVersion: null,
    });

    const highRisk = detectClaimRiskForBullet('Built Kubernetes workflows.', inventory);
    const mediumRisk = detectClaimRiskForBullet('Managed SOC2 readiness tasks.', inventory);
    const lowRisk = detectClaimRiskForBullet('Supported Polaris initiative planning.', inventory);

    expect(highRisk.level).toBe('High');
    expect(mediumRisk.level).toBe('Medium');
    expect(lowRisk.level).toBe('Low');
  });
});

