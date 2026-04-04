import { scoreCxFitV2 } from '../../analysis/cx-fit-scoring-v2';
import { extractCapabilityClusters } from '../extractors/capability-cluster-extractor';
import { getCapabilityClusterRegistry } from '../config/capability-clusters';

describe('capability cluster registry and scoring integration', () => {
  const registry = getCapabilityClusterRegistry();

  it('detects the key DevOps clusters for a sample JD', () => {
    const text =
      'Junior DevOps engineer working with AWS, Kubernetes, Terraform, CI/CD pipelines, and logging';
    const result = extractCapabilityClusters(text, registry);
    expect(result.clusters).toEqual(
      expect.arrayContaining([
        'cloud_infrastructure',
        'containerization',
        'infrastructure_as_code',
        'deployment_pipeline',
        'observability',
      ]),
    );
    expect(result.hitsByCluster.cloud_infrastructure).toBeGreaterThanOrEqual(1);
    expect(result.clusters.length).toBeGreaterThanOrEqual(5);
  });

  it('reports clusters in scoring and avoids zero overlap on DevOps jobs', () => {
    const job = {
      rawDescription: `
        Junior DevOps Engineer responsible for AWS automation, Kubernetes, Terraform, CI/CD, and logging playbooks.
        Supports incident response and monitoring while mentoring on pipelines and observability tooling.
      `,
      normalizedResponsibilities: [
        'Maintain CI/CD pipelines for AWS workloads',
        'Support incident response and observability tooling',
      ],
      normalizedRequirements: [
        'Experience with Terraform, Kubernetes, and logging or monitoring',
      ],
    };

    const baselineSections = [
      {
        type: 'EXPERIENCE',
        content: `
          Senior DevOps leader managing AWS infrastructure, Kubernetes and Terraform automation, GitHub Actions pipelines, and logging stacks.
          Oversees incident responses, MTTR improvements, and automation playbooks for reliability.
        `,
      },
    ];

    const scored = scoreCxFitV2({
      job,
      baselineSections,
    });

    expect(scored.debug.jobClusters.length).toBeGreaterThan(0);
    expect(scored.debug.baselineClusters.length).toBeGreaterThan(0);
    expect(scored.debug.sharedClusters.length).toBeGreaterThan(0);
    expect(scored.debug.jobClusters).toContain('cloud_infrastructure');
    expect(scored.debug.responsibilityOverlapPercent).toBeGreaterThan(0);
  });
});
