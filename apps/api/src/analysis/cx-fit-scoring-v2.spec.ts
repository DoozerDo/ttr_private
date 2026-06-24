import { scoreCxFitV2 } from './cx-fit-scoring-v2';

const nearMirrorBaselineSections = [
  {
    type: 'EXPERIENCE',
    content:       `Senior Director of Customer Operations who led incident management, service delivery, escalation governance, and service reliability.
      Owned ITSM process maturity, automation and workflow design, runbooks, dashboards, and KPIs while directing global coverage.
      Managed managers across contact center ops, chaired governance forums, and reported to the executive committee for SaaS and enterprise IT customers.`,
  },
  {
    type: 'SKILLS',
    content:
      'ServiceNow, AWS, Grafana, automation roadmaps, capacity planning, KPI frameworks, governance creation, dashboards',
  },
];

const nearMirrorJob = {
  rawDescription:     `Senior Director responsible for operating model design, governance creation, capacity planning, and KPI frameworks in global SaaS operations.
    Directs incident management, escalation governance, and service delivery while owning automation and workflow design, dashboards, KPIs, and contact center ops.
    Demonstrates execution through MTTR, SLA, and NPS improvements, incident command, CAB chaired, dashboards built, and automation delivered.`,
  normalizedResponsibilities: [
    'Lead incident management, escalation governance, service delivery, and service reliability across SaaS and enterprise IT clients',
    'Direct automation and workflow design, runbooks, dashboards, KPIs, and governance creation for global contact center ops',
  ],
  normalizedRequirements: [
    'Deep expertise with ServiceNow, AWS, Grafana, and automation roadmaps along with KPI frameworks and capacity planning',
  ],
};

const stretchBaselineSections = [
  {
    type: 'EXPERIENCE',
    content:       `Director of Service Delivery overseeing internal SaaS and enterprise IT operations.
      Drives service delivery while establishing governance and operational excellence for internal programs, including capacity planning and MTTR reporting.`,
  },
  {
    type: 'SKILLS',
    content: 'Service Delivery, ITSM',
  },
];

const stretchJob = {
  rawDescription:     `VP of Service Delivery for an MSP charter. Owns budget authority and field services org oversight while guiding service delivery discipline and automation workflows.
    Guides managed service provider delivery while shaping capacity planning and MTTR improvements.
    Sets governance creation and operating model design while reporting outcomes to the executive team.`,
  normalizedResponsibilities: [
    'Own service delivery oversight for MSP clients while guiding capacity planning and automation workflows',
    'Handle budget authority and field services org oversight across managed services operations',
  ],
  normalizedRequirements: [
    'Experience with managed service provider operations, governance creation, operating model design, and capacity planning for MSP revenue',
  ],
};

const toolingBaselineSections = [
  {
    type: 'EXPERIENCE',
    content:       `Customer operations leader for global SaaS service delivery, overseeing incident management, automation, contact center ops, and governance.
      Owned dashboards and KPI frameworks while leading reliability and service delivery across global teams.`,
  },
  {
    type: 'SKILLS',
    content: 'AWS, Grafana, automation, dashboards, ITSM, runbooks',
  },
];

const toolingJob = {
  rawDescription:     `Lead incident management, service delivery, and automation across global teams.
    Manages managers, reports to the executive team, and defines operating model design, tooling roadmap, and KPI frameworks for regulated reliability.
    ServiceNow is required along with Service Desk automation to deliver dashboards and KPIs for critical programs.`,
  normalizedResponsibilities: [
    'Lead incident management, service delivery, and automation for global regulated coverage',
    'Direct tooling roadmap, operating model design, and KPI frameworks with a focus on dashboards and reliability while managing managers',
  ],
  normalizedRequirements: [
    'Hands-on ServiceNow experience plus Salesforce or Service Desk automation knowledge',
  ],
};

describe('scoreCxFitV2', () => {
  it('scores a near mirror role in the strong-fit band', () => {
    const result = scoreCxFitV2({
      job: nearMirrorJob,
      baselineSections: nearMirrorBaselineSections,
    });

    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it('uses the explicit Resume rubric weights and clears the apply-eligible band for a strong verified match', () => {
    const strongBaselineSections = [
      {
        type: 'EXPERIENCE',
        content:
          `Senior Director of Customer Operations leading global support operations, incident management, escalations, automation, dashboards, KPI frameworks, and executive reporting.
          Owned service delivery, cross-functional leadership, program ownership, customer advocacy, and operating model design for B2B SaaS and enterprise customers.
          Drove change leadership, transformation, subscription billing alignment, and compliance-heavy workflows across regions.`,
      },
      {
        type: 'SKILLS',
        content:
          'ServiceNow, Salesforce, Zendesk, automation, dashboards, KPI frameworks, executive reporting, incident management, operating model design, change leadership, compliance',
      },
    ];

    const strongJob = {
      rawDescription:
        `Senior Director of Customer Operations responsible for service delivery, incident management, escalations, dashboards, KPI frameworks, automation, and executive stakeholder management.
        Leads cross-functional operating rhythm design for B2B SaaS and enterprise customers while balancing strategy, execution, process rigor, and transformation.
        Owns customer advocacy, operating model design, and subscription billing readiness across compliance-heavy workflows.`,
      normalizedResponsibilities: [
        'Lead service delivery, incident management, escalations, and operating rhythm design for B2B SaaS and enterprise customers',
        'Own dashboards, KPI frameworks, automation, and executive stakeholder communication across cross-functional teams',
        'Guide change leadership, transformation, and operating model design across compliance-heavy workflows',
      ],
      normalizedRequirements: [
        'Experience with customer advocacy, program ownership, and modern support tooling such as ServiceNow, Salesforce, or Zendesk',
        'Experience with subscription billing, compliance, and enterprise customer operations',
      ],
    };

    const result = scoreCxFitV2({
      job: strongJob,
      baselineSections: strongBaselineSections,
      metadata: { jobId: 'job-strong', baselineId: 'baseline-strong' },
      jobTitle: 'Senior Director of Customer Operations',
      normalizedJobResponsibilities: strongJob.normalizedResponsibilities,
      normalizedJobRequirements: strongJob.normalizedRequirements,
    });

    expect(result.rubric.weights).toEqual({
      role_scope_and_seniority: 30,
      support_operations_and_process_rigor: 20,
      tooling_and_platform_experience: 20,
      domain_and_business_context: 15,
      change_leadership_and_customer_advocacy: 15,
    });
    expect(result.rubric.dimensionPercents.role_scope_and_seniority).toBeGreaterThan(75);
    expect(result.rubric.dimensionPercents.support_operations_and_process_rigor).toBeGreaterThan(60);
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it('applies stretch dampening for an MSP scenario', () => {
    const result = scoreCxFitV2({
      job: stretchJob,
      baselineSections: stretchBaselineSections,
    });

    expect(result.score).toBeGreaterThanOrEqual(54);
    expect(result.score).toBeLessThanOrEqual(65);
  });

  it('keeps tooling floor behavior conservative when scope and leadership are strong', () => {
    const result = scoreCxFitV2({
      job: toolingJob,
      baselineSections: toolingBaselineSections,
    });

    expect(result.score).toBeGreaterThanOrEqual(54);
  });

  it('gives bounded score credit to support operations evidence without inflating unsupported gaps', () => {
    const result = scoreCxFitV2({
      job: {
        rawDescription:           `Support operations leader responsible for escalation management, service delivery, and operational process ownership.
          Owns incident management, support process design, and customer operations leadership across global teams.`,
        normalizedResponsibilities: [
          'Own support operations, escalation management, and service delivery across customer teams',
        ],
        normalizedRequirements: [
          'Experience with support process ownership, incident management, and customer operations leadership',
        ],
      },
      baselineSections: [
        {
          type: 'EXPERIENCE',
          content:             `Owned global incident and escalation management for customer operations supporting Fortune 500 accounts.
            Led support and development teams of fifty plus across NA, EMEA, and APAC.`,
        },
      ],
    });

    expect(result.rubric.dimensionPercents.support_operations_and_process_rigor).toBeGreaterThan(30);
    expect(result.rubric.dimensionPercents.role_scope_and_seniority).toBeGreaterThan(30);
    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it('gives bounded score credit to leadership-at-scale and transformation evidence', () => {
    const result = scoreCxFitV2({
      job: {
        rawDescription:           `Director responsible for change leadership, transformation, and operating model rollout across global teams.
          Owns adoption, migration, and cross-functional coordination for enterprise support operations.`,
        normalizedResponsibilities: [
          'Lead transformation and operating model rollout across global teams',
        ],
        normalizedRequirements: [
          'Experience with change leadership, adoption, migration, and cross-functional coordination',
        ],
      },
      baselineSections: [
        {
          type: 'EXPERIENCE',
          content:             `Led support and development teams of fifty plus across NA, EMEA, and APAC.
            Drove rollout of a new support operating model across regions and managed cross-functional service delivery change.`,
        },
      ],
    });

    expect(result.rubric.dimensionPercents.change_leadership_and_customer_advocacy).toBeGreaterThan(35);
    expect(result.rubric.dimensionPercents.role_scope_and_seniority).toBeGreaterThan(30);
    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it('does not boost unsupported categories the same way as clearly aligned evidence', () => {
    const result = scoreCxFitV2({
      job: {
        rawDescription:           `Analytics strategy lead responsible for measurement design and experimentation governance.
          Owns analytics strategy and data platform direction.`,
        normalizedResponsibilities: [
          'Own analytics strategy and measurement design',
        ],
        normalizedRequirements: [
          'Experience with analytics governance and experimentation',
        ],
      },
      baselineSections: [
        {
          type: 'EXPERIENCE',
          content:             `Managed inbox routing and general administration for a regional support queue.`,
        },
      ],
    });

    expect(result.rubric.dimensionPercents.support_operations_and_process_rigor).toBeLessThan(35);
    expect(result.rubric.dimensionPercents.change_leadership_and_customer_advocacy).toBeLessThan(35);
  });

  it('lifts a credible cloud network adjacency case without inflating it into a direct match', () => {
    const result = scoreCxFitV2(
      {
        job: {
          rawDescription:     `Cloud Network Engineer responsible for BGP, VLAN design, datacenter networking, and device operations across Linux infrastructure.
            Owns Arista, Cisco, Juniper, and Mellanox environments with remote access, monitoring, and automation.`,
          normalizedResponsibilities: [
            'Lead BGP routing, VLAN design, and datacenter networking for cloud environments',
            'Operate Arista, Cisco, Juniper, and Mellanox network devices with automation and monitoring',
          ],
          normalizedRequirements: [
            'Experience with Linux infrastructure, remote access, and infrastructure automation',
          ],
        },
        baselineSections: [
          {
            type: 'EXPERIENCE',
            content:
              `Infrastructure engineer and datacenter technician supporting Linux systems, BGP routing, and network devices.
              Maintained remote access, monitoring, automation, and device operations in a high-complexity technical environment.`,
          },
          {
            type: 'SKILLS',
            content: 'Linux, BGP, VLAN, Arista, Cisco, Juniper, Mellanox, monitoring, automation',
          },
        ],
      },
      { debugBundle: true },
    );

    expect(result.debug.heuristicInference.usedHeuristicInference).toBe(true);
    expect(result.debug.heuristicInference.heuristicLiftTotal).toBeGreaterThan(0);
    expect(result.debug.heuristicInference.heuristicLiftByDimension.tooling_and_platform_experience).toBeGreaterThan(0);
    expect(result.debug.heuristicInference.heuristics.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.score).toBeLessThan(85);
  });

  it('caps inflated scores when baseline evidence is too thin to support the role scope', () => {
    const weakBaselineSections = [
      {
        type: 'EXPERIENCE',
        content:
          'Handled tickets and general support tasks.\n' +
          'Helped with basic troubleshooting.\n' +
          'Assisted with documentation updates.',
      },
      { type: 'SKILLS', content: 'Excel, email, basic troubleshooting' },
    ];
    const seniorScopedJob = {
      rawDescription:
        'Own enterprise support operations, manage managers, define operating model and tooling roadmap, and lead global incident management. ServiceNow required.',
      normalizedResponsibilities: [
        'Define operating model and KPI frameworks for support operations',
        'Lead incident management and escalation programs across global teams',
        'Manage managers and drive process rigor with tooling roadmap ownership',
      ],
      normalizedRequirements: ['Hands-on ServiceNow administration experience'],
    };

    const result = scoreCxFitV2({
      job: seniorScopedJob as any,
      baselineSections: weakBaselineSections as any,
    });

    expect(result.score).toBeLessThan(80);
    if (result.score === 79) {
      expect(result.rubric.penalties.some((p) => p.code === 'insufficient_baseline_support')).toBe(true);
    }
  });

  it('recognizes direct network-infrastructure evidence strongly enough to reach the strong-fit band', () => {
    const result = scoreCxFitV2(
      {
        job: {
          rawDescription: `Network Engineer on an HPC/AI team responsible for BGP, VLAN design, datacenter networking, Linux infrastructure, and network device operations across Azure cloud environments.`,
          normalizedResponsibilities: [
            'Lead BGP routing, VLAN design, datacenter networking, and network device operations',
            'Operate Linux infrastructure, monitoring, and automation across cloud networking environments',
          ],
          normalizedRequirements: [
            'Experience with Arista, Cisco, Juniper, Mellanox, VMware, firewalls, and network troubleshooting',
          ],
        },
        baselineSections: [
          {
            type: 'EXPERIENCE',
            content: `Infrastructure engineer and datacenter technician supporting Linux systems, BGP routing, VLANs, firewalls, virtualization, monitoring, and switch deployments.
              Supported network infrastructure, server deployment, cabling, physical infrastructure, and live-site troubleshooting across complex environments.`,
          },
          {
            type: 'SKILLS',
            content: 'Linux, BGP, VLAN, DNS, DHCP, VPN, Cisco, Juniper, Arista, Mellanox, VMware, monitoring, datacenter operations',
          },
        ],
      },
      { debugBundle: true },
    );

    expect(result.debug.jobVectorsLength).toBeGreaterThan(0);
    expect(result.debug.responsibilityOverlapPercent).toBeGreaterThan(0);
    expect(result.rubric.dimensionPercents.tooling_and_platform_experience).toBeGreaterThan(55);
    expect(result.rubric.dimensionPercents.domain_and_business_context).toBeGreaterThan(55);
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('keeps heuristics quiet on shallow keyword overlap', () => {
    const result = scoreCxFitV2(
      {
        job: {
          rawDescription: 'Office administrator role with calendar management and document filing.',
          normalizedResponsibilities: ['Manage calendars and documents'],
          normalizedRequirements: ['Communication and organization'],
        },
        baselineSections: [
          {
            type: 'EXPERIENCE',
            content: 'Supported general office operations and filing for a small team.',
          },
        ],
      },
      { debugBundle: true },
    );

    expect(result.debug.heuristicInference.usedHeuristicInference).toBe(false);
    expect(result.debug.heuristicInference.heuristicLiftTotal).toBe(0);
    expect(result.score).toBeLessThan(40);
  });

  it('translates support verbs only when the surrounding technical context is rich', () => {
    const result = scoreCxFitV2(
      {
        job: {
          rawDescription:     `Infrastructure analyst responsible for supporting Linux systems, maintaining VM lifecycle workflows, configuring monitoring, and operating remote access across cloud infrastructure.`,
          normalizedResponsibilities: [
            'Supported Linux infrastructure, VM lifecycle workflows, and monitoring',
            'Maintained remote access, automation, and operational runbooks',
          ],
          normalizedRequirements: [
            'Configured infrastructure tools and operated technical environments',
          ],
        },
        baselineSections: [
          {
            type: 'EXPERIENCE',
            content:
              'Supported Linux systems, maintained monitoring, and configured VM lifecycle workflows for infrastructure operations.',
          },
        ],
      },
      { debugBundle: true },
    );

    expect(result.debug.heuristicInference.usedHeuristicInference).toBe(true);
    expect(
      result.debug.heuristicInference.heuristics.some((entry) => entry.type === 'verb_translation'),
    ).toBe(true);
    expect(result.rubric.dimensionPercents.support_operations_and_process_rigor).toBeGreaterThan(30);
    expect(result.score).toBeGreaterThanOrEqual(34);
  });

  it('keeps scope and seniority constrained for adjacent but lower-scope candidates', () => {
    const result = scoreCxFitV2(
      {
        job: {
          rawDescription:     `Director of Cloud Network Engineering responsible for operating model, cross-functional leadership, and global network strategy.
            Owns BGP, datacenter networking, and platform direction.`,
          normalizedResponsibilities: [
            'Lead cloud network engineering strategy and cross-functional delivery',
            'Own BGP and datacenter networking operations',
          ],
          normalizedRequirements: [
            'Experience leading cloud networking platforms and infrastructure direction',
          ],
        },
        baselineSections: [
          {
            type: 'EXPERIENCE',
            content:
              `Datacenter technician and infrastructure engineer supporting BGP routing, network devices, and Linux systems.
              Managed automation, monitoring, and device operations but did not own organizational strategy.`,
          },
        ],
      },
      { debugBundle: true },
    );

    expect(result.debug.heuristicInference.heuristicLiftByDimension.role_scope_and_seniority).toBeLessThanOrEqual(2);
    expect(result.debug.heuristicInference.heuristicLiftByDimension.tooling_and_platform_experience).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThan(80);
  });

  it('ignores polluted raw job requirements when validated requirements are supplied', () => {
    const cleanRequirements = [
      'Own network operations and routing reliability for production services.',
      'Maintain BGP routing, VLAN segmentation, and datacenter switch operations.',
    ];

    const pollutedJob = {
      job: {
        rawDescription:
          'Network engineer role responsible for datacenter routing and infrastructure.',
        normalizedResponsibilities: [
          'Operate production networking and incident response workflows.',
        ],
        normalizedRequirements: [
          ...cleanRequirements,
          'The HPC/AI team is on a mission to build the',
          'Demonstrates some knowledge of data — knows what data is',
        ],
      },
      normalizedJobResponsibilities: [
        'Operate production networking and incident response workflows.',
      ],
      normalizedJobRequirements: cleanRequirements,
      baselineSections: [
        {
          type: 'EXPERIENCE',
          content:
            'Built datacenter networking and routing reliability for production services. Maintained BGP, VLANs, and switch operations.',
        },
      ],
      jobTitle: 'Network Engineer',
    } as const;

    const pollutedResult = scoreCxFitV2(pollutedJob);
    const cleanResult = scoreCxFitV2({
      ...pollutedJob,
      job: {
        ...pollutedJob.job,
        normalizedRequirements: cleanRequirements,
      },
    });

    expect(pollutedResult.score).toBe(cleanResult.score);
  });

  it('recognizes explicit infra and network evidence in a Dalen-style baseline for network roles', () => {
    const richBaseline = [
      {
        type: 'SUMMARY',
        content:
          'Infrastructure professional with security, Linux systems, datacenter hardware, network infrastructure, and firewalls.',
      },
      {
        type: 'SKILLS',
        content:
          'VLAN, DHCP, VPN, DNS, Cisco ASA, Sophos, Unifi, Fortinet, Palo Alto, VMware, Azure, failover clusters, reverse proxies, Cisco, Juniper, Arista, Mellanox, Dell, HP switches.',
      },
      {
        type: 'EXPERIENCE',
        content:
          'Linux systems administration, Linux VMs, monitoring, Linux and network infrastructure tickets, and internal tools for network scanning and asset tracking.',
      },
      {
        type: 'EXPERIENCE',
        content:
          'Core lab infrastructure, Layer 2 networking devices, KVMs, PDUs, UPS systems, Linux automation, System Center, Cisco, Dell, Mellanox, SONiC, Arista, Layer 3 routing, and BGP configuration.',
      },
      {
        type: 'EXPERIENCE',
        content:
          'Physical infrastructure, cabling, network runs, server deployment, troubleshooting, and datacenter operations.',
      },
    ];

    const richResult = scoreCxFitV2({
      job: {
        rawDescription:
          'Network Engineer responsible for network infrastructure, routing, firewalls, and datacenter operations.',
        normalizedResponsibilities: [
          'Own network infrastructure, routing, and firewall operations',
          'Support datacenter networking and monitoring',
        ],
        normalizedRequirements: [
          'Experience with Linux systems, BGP, VLANs, and switch operations',
        ],
      },
      baselineSections: richBaseline,
      jobTitle: 'Network Engineer',
    });

    const bareResult = scoreCxFitV2({
      job: {
        rawDescription:
          'Network Engineer responsible for network infrastructure, routing, firewalls, and datacenter operations.',
        normalizedResponsibilities: [
          'Own network infrastructure, routing, and firewall operations',
          'Support datacenter networking and monitoring',
        ],
        normalizedRequirements: [
          'Experience with Linux systems, BGP, VLANs, and switch operations',
        ],
      },
      baselineSections: [
        {
          type: 'EXPERIENCE',
          content: 'Built software features and maintained product documentation.',
        },
      ],
      jobTitle: 'Network Engineer',
    });

    expect(richResult.debug.domainTagsBaseline).toEqual(
      expect.arrayContaining(['Enterprise IT', 'Internal Delivery']),
    );
    expect(
      richResult.debug.penalties?.find((penalty) => penalty.code === 'domain_mismatch_hard'),
    ).toBeUndefined();
    expect(richResult.score).toBeGreaterThan(bareResult.score);
    expect(richResult.rubric.dimensionPercents.tooling_and_platform_experience).toBeGreaterThanOrEqual(
      bareResult.rubric.dimensionPercents.tooling_and_platform_experience,
    );
    expect(richResult.rubric.dimensionPercents.domain_and_business_context).toBeGreaterThanOrEqual(
      bareResult.rubric.dimensionPercents.domain_and_business_context,
    );
  });
});
