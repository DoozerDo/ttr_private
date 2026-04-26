import type {
  GoldStandardBenchmarkFixture,
  SyntheticGenerationBaselineFixture,
  SyntheticGenerationFixtureBundle,
  SyntheticGenerationJobFixture,
  SyntheticGenerationScenario,
} from "./synthetic-generation.types";

const BANNED_FAILURE_STATES = [
  "generation_blocked",
  "fit_score_too_low",
  "no_evidence",
  "unexpected payload",
  "empty artifact payload",
];

function fixtureSourceArtifact(fixtureId: string, label: string) {
  return {
    kind: "fixture" as const,
    fixtureId,
    label,
  };
}

const SUPPORT_OPS_BASELINE: SyntheticGenerationBaselineFixture = {
  id: "baseline-support-ops-director-v1",
  originalFilename: "support-ops-director-baseline.txt",
  storagePath: "synthetic://generation/support-ops-director/baseline_v1",
  version: 1,
  sections: [
    {
      id: "support-ops-section-0",
      title: "Support Operations Leadership",
      sectionType: "SUMMARY",
      content:
        "Support Operations Director with ownership of queue health, service delivery, escalation governance, staffing tradeoffs, and weekly operating rhythm for a SaaS team. Partners with product, engineering, cloud infrastructure, and customer support on incident response, routing, and service quality improvements.",
    },
    {
      id: "support-ops-section-0b",
      title: "Operating Rhythm And Governance",
      sectionType: "SUMMARY",
      content:
        "Owns the support operations program, weekly operating rhythm, escalation playbooks, and tooling roadmap while coordinating customer advocacy, queue health, staffing tradeoffs, and support tooling governance across two regions and three queues so leaders can make practical decisions with clearer service data and calmer execution.",
    },
    {
      id: "support-ops-section-0c",
      title: "Technical Skills",
      sectionType: "SKILLS",
      content:
        "Zendesk | Jira | Salesforce Service Cloud | SQL | Looker | Linux | monitoring | VPN | DNS | DHCP | remote access | queue health | capacity planning | staffing tradeoffs | weekly operating reviews | voice of the customer | customer advocacy | CSAT | self service",
    },
    {
      id: "support-ops-section-1",
      title: "Support Operations Leadership",
      sectionType: "EXPERIENCE",
      content:
        [
          "Support Operations Director | Example SaaS | Seattle, WA",
          "2019 - 2022",
          "- Owned support workflow design and queue health for a SaaS team.",
          "- Built dashboards and KPI reporting for executive reviews and staffing decisions.",
          "- Kept staffing and SLA trends visible for support leaders.",
          "- Coached managers on escalation handling and customer communication.",
        ].join("\n"),
    },
    {
      id: "support-ops-section-2",
      title: "Operating Model And Outcomes",
      sectionType: "EXPERIENCE",
      content:
        [
          "Workflow And Incident Design Lead | Example SaaS | Seattle, WA",
          "2022 - 2024",
          "- Partnered with cloud teams on incident response and service reliability.",
          "- Standardized Zendesk, Jira, and Salesforce Service Cloud reporting and tooling governance.",
          "- Drove change coordination, problem management, and recurring issue follow-up.",
          "- Created runbooks and process notes that tightened handoffs during active incidents.",
        ].join("\n"),
    },
    {
      id: "support-ops-section-3",
      title: "Program Ownership",
      sectionType: "EXPERIENCE",
      content:
        [
          "Support Operations Program Owner | Example SaaS | Seattle, WA",
          "2024 - Present",
          "- Led operating reviews, coaching rhythms, and escalation playbooks.",
          "- Led cross functional prioritization on recurring issue fixes.",
          "- Improved automation workflows and ITSM process maturity.",
          "- Used voice of the customer, CSAT trends, and self service signals to guide change leadership.",
          "- Owned capacity planning and staffing tradeoffs across two regions and three queues.",
          "- Reduced repeat escalations, improved SLA adherence, and lowered response time.",
          "- Kept issue analysis and service metrics aligned with the operating rhythm.",
          "- Built operating reviews and playbooks that clarified ownership.",
          "- Aligned support tooling, reporting, and team workflows to the operating model.",
          "- Maintained leadership visibility into customer advocacy and service quality.",
        ].join("\n"),
    },
  ],
  allowedCompanies: ["Example SaaS", "Acme", "Northwind Support"],
  allowedRoles: ["Support Operations Director", "Director of Support Operations", "Customer Operations Director"],
  allowedTechnologies: [
    "Zendesk",
    "SQL",
    "Looker",
    "Jira",
    "Salesforce Service Cloud",
    "Linux",
    "monitoring",
    "VPN",
    "DNS",
    "DHCP",
    "remote access",
  ],
  allowedMetricTokens: ["SLA", "CSAT", "backlog", "response time", "capacity planning", "staffing"],
};

const INCIDENT_BASELINE: SyntheticGenerationBaselineFixture = {
  id: "baseline-incident-service-leader-v1",
  originalFilename: "incident-service-leader-baseline.txt",
  storagePath: "synthetic://generation/incident-service-leader/baseline_v1",
  version: 1,
  sections: [
    {
      id: "incident-section-1",
      title: "Incident Operations",
      sectionType: "EXPERIENCE",
      content:
        "Led incident response routines for customer-facing services, strengthening escalation readiness and service recovery discipline. Improved the visibility of major incidents by clarifying the operating cadence for engineers, support leads, and customer-facing teams.",
    },
    {
      id: "incident-section-2",
      title: "Service Delivery Systems",
      sectionType: "EXPERIENCE",
      content:
        "Built process architecture that connected triage, ownership, and action tracking so service delivery moved faster across teams. Documented the escalation paths and review rhythm needed to keep support operations aligned with reliability goals.",
    },
    {
      id: "incident-section-3",
      title: "Leadership And Coordination",
      sectionType: "EXPERIENCE",
      content:
        "Partnered with product and engineering on service delivery priorities, incident postmortems, and recurring issue reduction. Used cross-functional leadership to keep the work visible and to make action tracking actions more consistent.",
    },
  ],
  allowedCompanies: ["Example SaaS", "Acme", "Northwind Support"],
  allowedRoles: ["Incident and Service Delivery Leader", "Service Delivery Manager", "Incident Operations Leader"],
  allowedTechnologies: ["PagerDuty", "Jira", "Looker", "Zendesk"],
  allowedMetricTokens: ["incident", "escalation", "service delivery", "triage"],
};

const CUSTOMER_OPS_BASELINE: SyntheticGenerationBaselineFixture = {
  id: "baseline-customer-ops-strategy-v1",
  originalFilename: "customer-ops-strategy-baseline.txt",
  storagePath: "synthetic://generation/customer-ops-strategy/baseline_v1",
  version: 1,
  sections: [
    {
      id: "customer-ops-section-1",
      title: "Customer Operations Strategy",
      sectionType: "EXPERIENCE",
      content:
        "Directed customer operations work that connected support capacity, service quality, and customer experience leadership. Built operating reviews that helped managers see backlog trends, customer pain points, and the tradeoffs behind staffing decisions.",
    },
    {
      id: "customer-ops-section-2",
      title: "Support Strategy And Workflow",
      sectionType: "EXPERIENCE",
      content:
        "Improved support strategy by tightening workflow design, escalation ownership, and process architecture. Partnered with enablement and product teams to make the service motion easier to run and easier to scale.",
    },
    {
      id: "customer-ops-section-3",
      title: "Customer Advocacy",
      sectionType: "EXPERIENCE",
      content:
        "Used cross-functional leadership to connect customer feedback, operational data, and service delivery planning. Introduced clearer customer operations routines that reduced confusion and made response standards more visible.",
    },
  ],
  allowedCompanies: ["Example SaaS", "Acme", "Northwind Support"],
  allowedRoles: ["Customer Operations Director", "Support Strategy Leader", "Customer Experience Operations Lead"],
  allowedTechnologies: ["Zendesk", "Looker", "Salesforce", "SQL"],
  allowedMetricTokens: ["CSAT", "NPS", "backlog", "service quality"],
};

const SUPPORT_OPS_JOB: SyntheticGenerationJobFixture = {
  id: "job-support-ops-director-v1",
  title: "Director of Support Operations",
  company: "Example SaaS",
  rawDescription: `
Lead support operations for a scaling B2B SaaS team with responsibility for service delivery, queue health, escalation governance, operating model design, and weekly operating reviews. The role owns staffing tradeoffs, service quality reporting, incident coordination, and the cadence that keeps support predictable for customers and internal partners. You will translate queue trends, escalation patterns, and customer feedback into clear actions that improve response time, SLA adherence, and team clarity.

Partner closely with product, engineering, infrastructure, and customer success on problem management, change management, and recurring issue reduction. Use operating reviews, dashboards, and action tracking to make cross-functional ownership visible, keep the right priorities in view, and ensure support work moves with discipline rather than urgency alone. The work includes shaping governance, improving playbooks, and helping leaders see where the operating model needs adjustment.

This team relies on Zendesk, Jira, Salesforce Service Cloud, and reporting workflows that support leadership decision making. A strong candidate will understand ITSM process maturity, automation workflows, capacity planning, workforce tradeoffs, Linux infrastructure, monitoring, remote access, VPN, DNS, and DHCP. They should be comfortable turning service data into practical action and keeping the tooling roadmap aligned with the needs of the support function.

Success in the role means maintaining reliable service quality, coaching managers, coordinating incident command and follow up, and building a calmer operating rhythm for the team. You should be able to communicate clearly with executives, partner across functions, keep the voice of the customer visible, and build a support operation that is measurable, resilient, and easy to run.
`,
  normalizedResponsibilities: [
    "Own support operations scope.",
    "Lead incident response.",
    "Run weekly operating reviews.",
    "Own the tooling roadmap.",
  ],
  normalizedRequirements: [
    "Support operations rigor",
    "Incident response rigor",
    "Operating model design",
    "Dashboards and reporting",
  ],
};

const SUPPORT_MODERATE_JOB: SyntheticGenerationJobFixture = {
  id: "job-support-ops-manager-v1",
  title: "Support Operations Manager",
  company: "Example SaaS",
  rawDescription:
    "Own support workflow design, queue health, coaching rhythms, and weekly reporting for a growing customer support team. Improve service quality, handoffs, and cross-functional action tracking.",
  normalizedResponsibilities: [
    "Own daily support operations and queue health.",
    "Improve workflow design and coaching routines.",
    "Partner with product and engineering on issue action tracking.",
    "Keep leadership reporting clear and reliable.",
  ],
  normalizedRequirements: [
    "Support operations rigor",
    "Workflow design",
    "Queue health management",
    "Cross-functional execution",
  ],
};

const INCIDENT_JOB: SyntheticGenerationJobFixture = {
  id: "job-incident-service-leader-v1",
  title: "Service Delivery and Incident Operations Leader",
  company: "Example SaaS",
  rawDescription: `
Lead service delivery and incident response across support and engineering for a SaaS team that needs calmer escalations, clearer ownership, and a steadier operating rhythm. The role designs the motion for triage, postmortems, and customer-facing recovery so teams move quickly when the queue gets noisy without losing visibility. It also turns incident learning into practical changes that make repeat issues easier to prevent.

Partner with support, engineering, and infrastructure to run major incident follow-up, define handoffs, and keep communication steady while issues are active. The leader should be comfortable facilitating reviews, clarifying next-step ownership, and making sure the work stays visible to the people who need to act on it. Success depends on practical judgment, cross-functional coordination, and a strong sense of service reliability.

The environment includes PagerDuty, Jira, Zendesk, monitoring, and reporting workflows that keep service delivery measurable. A strong candidate will know how to use those tools to reduce repeat escalations, improve response quality, and keep the operating cadence easy to sustain. The first ninety days should focus on strengthening the incident motion, improving process clarity, and giving leaders a steadier view of where the work gets stuck.
`,
  normalizedResponsibilities: [
    "Own service delivery execution and incident response discipline.",
    "Build escalation and triage routines for support and engineering.",
    "Improve postmortem action tracking and recurring issue reduction.",
    "Partner cross-functionally on operating cadence and service quality.",
  ],
  normalizedRequirements: [
    "Service delivery leadership",
    "Incident response rigor",
    "Process architecture",
    "Cross-functional leadership",
    "Escalation management",
    "Major incident follow-up",
    "Customer communication",
    "Service reliability",
  ],
};

const INCIDENT_BLOCKED_JOB: SyntheticGenerationJobFixture = {
  id: "job-incident-response-coordinator-v1",
  title: "Incident Response Coordinator",
  company: "Example SaaS",
  rawDescription:
    "Coordinate incident triage, escalation routing, and service notes for a customer facing support team. Keep owners informed, document the next steps, and support the operating rhythm during active issues.",
  normalizedResponsibilities: [
    "Coordinate incident triage and owner routing.",
    "Maintain service notes and escalation tracking.",
    "Support the operating rhythm during active issues.",
    "Keep cross-functional updates current.",
  ],
  normalizedRequirements: [
    "Incident coordination",
    "Escalation tracking",
    "Service notes",
    "Cross-functional communication",
  ],
};

const CUSTOMER_OPS_JOB: SyntheticGenerationJobFixture = {
  id: "job-customer-ops-strategy-v1",
  title: "Customer Operations and Support Strategy Director",
  company: "Example SaaS",
  rawDescription:
    "Own customer operations and support strategy for a growing SaaS business. Improve workflow design, customer experience leadership, and the metrics rhythm used to keep service quality visible to senior leaders.",
  normalizedResponsibilities: [
    "Own customer operations strategy and support workflow design.",
    "Create operating reviews that make customer pain points visible.",
    "Partner with product and support leadership on process improvements.",
    "Tighten service delivery routines across the customer journey.",
  ],
  normalizedRequirements: [
    "Customer operations leadership",
    "Support strategy",
    "Workflow design",
    "Customer experience leadership",
  ],
};

const CUSTOMER_MODERATE_JOB: SyntheticGenerationJobFixture = {
  id: "job-customer-ops-manager-v1",
  title: "Customer Operations Manager",
  company: "Example SaaS",
  rawDescription:
    "Own customer operations reporting, workflow design, and service quality routines for a scaling SaaS team. Help leaders see backlog trends, staffing tradeoffs, and customer pain points more clearly.",
  normalizedResponsibilities: [
    "Own customer operations reporting and cadence.",
    "Improve workflow design and service quality routines.",
    "Help leaders understand backlog trends and staffing tradeoffs.",
    "Translate customer pain points into practical action tracking.",
  ],
  normalizedRequirements: [
    "Customer operations leadership",
    "Workflow design",
    "Service quality management",
    "Customer experience leadership",
  ],
};

const SUPPORT_OPS_BENCHMARK = {
  fixtureId: "support-ops-director-benchmark-v1",
  baselineId: SUPPORT_OPS_BASELINE.id,
  jobId: SUPPORT_OPS_JOB.id,
  scenarioName: "Support operations director",
  benchmarkPositioningFrame: "Customer Operations and Support Strategy leader",
  notes: "Strong benchmark for support workflow rigor, early proof, and additive cover-letter framing.",
  approvedBenchmarkResume: {
    summary:
      "Support Operations Director with operating model ownership, governance design, tooling roadmap responsibility, and customer-facing support leadership for a SaaS support team. Leads queue health, service reliability, incident management, ITSM process maturity, automation workflows, dashboards and KPIs, voice of the customer, customer advocacy, and capacity planning through weekly operating reviews and executive updates.",
    bullets: [
      "Owned the support operations operating model and support workflow design for a high-volume SaaS support team.",
      "Built dashboards and KPIs for executive communication and weekly operating reviews that kept staffing tradeoffs, SLA adherence, and queue health visible.",
      "Partnered with cloud infrastructure and observability teams on incident response, major incident follow-up, incident command, and service reliability.",
      "Standardized ticketing system governance in Zendesk and Jira, plus CRM reporting in Salesforce Service Cloud, so routing and handoff stayed predictable.",
      "Drove automation workflows and ITSM process maturity improvements that reduced repeat escalations, improved SLA adherence, and reduced time to resolution.",
    ],
  },
  approvedBenchmarkCoverLetter: {
    opening:
      "I am applying for Support Operations Director because my background fits a team that needs stronger support workflows, clearer escalation routines, and steady operating discipline. I have owned support operating models, ITSM process maturity, governance design, and tooling roadmaps for SaaS teams, and I have used Zendesk, Jira, and Salesforce Service Cloud to keep the work moving with fewer surprises.",
    bodyParagraphs: [
      "In my recent work, I have improved support operations reliability, partnered with cloud infrastructure and observability teams on incident response, and worked to remove recurring customer pain points. I have also kept capacity planning, staffing tradeoffs, automation workflows, queue health, voice of the customer, customer advocacy, and CSAT visible in the same operating rhythm.",
      "That combination lets me contribute quickly without repeating the resume: I can bring operating discipline, clearer workflow ownership, practical coordination within support operations, and a reliable way to keep service quality visible and reduce time to resolution.",
    ],
    closingParagraph:
      "I would welcome the chance to discuss how that experience can support your team's service quality and operating rhythm.",
  },
};

const INCIDENT_BENCHMARK = {
  fixtureId: "incident-service-leader-benchmark-v1",
  baselineId: INCIDENT_BASELINE.id,
  jobId: INCIDENT_JOB.id,
  scenarioName: "Incident and service delivery leader",
  benchmarkPositioningFrame: "Service delivery and incident operations leader",
  notes: "Shows stronger incident-specific framing and first-paragraph specificity.",
  approvedBenchmarkResume: {
    summary:
      "Service delivery and incident operations leader focused on support operations rigor, service delivery and incident response, team coordination, and process and workflow design. Builds operating rhythms that shorten response time and improve how teams handle escalations with incident response rigor and process architecture.",
    bullets: [
      "Led service delivery leadership work for customer facing services and built incident response rigor into escalation triage across support and engineering.",
      "Built process architecture that clarified ownership, reduced handoff delays, and improved service recovery after major incidents.",
      "Created operating cadences that kept recurring issues visible and made the next actions easier for team leadership.",
      "Partnered with support, product, and engineering to keep incident response disciplined and customer communication clear.",
    ],
  },
  approvedBenchmarkCoverLetter: {
    opening:
      "I am applying for this role because my work has centered on service delivery leadership, incident response rigor, and process architecture. I have helped support and engineering partners stay aligned during urgent moments, and I know how to keep customer recovery work organized without losing sight of the team rhythm. I have also led operating reviews that made escalation ownership and next actions visible to the whole team.",
    bodyParagraphs: [
      "My strongest contribution is the combination of incident response rigor and process clarity. I have helped teams reduce handoff friction, keep service recovery visible, and make the next owner, the next action, and the expected timeline easy for everyone to see. That discipline helps teams protect service quality while keeping response time steady. It also gives managers a calmer way to work through the busiest incidents.",
      "I also bring a practical approach to team coordination. I have used review cadences, escalation paths, and simple operating notes to keep support, product, and engineering aligned on what matters most. That makes it easier to address recurring issues, communicate with confidence, and keep the service model moving in the same direction. It also helps the team turn postmortem follow up into real service delivery improvements.",
    ],
    closingParagraph:
      "I would welcome the chance to discuss how this background could support your service delivery and incident goals. I would aim to bring calm execution, clear ownership, and a steady rhythm that helps the team stay responsive when demand rises. I would also be ready to work closely with frontline managers so improvements hold up in practice.",
  },
};

const CUSTOMER_OPS_BENCHMARK = {
  fixtureId: "customer-ops-strategy-benchmark-v1",
  baselineId: CUSTOMER_OPS_BASELINE.id,
  jobId: CUSTOMER_OPS_JOB.id,
  scenarioName: "Customer operations and support strategy",
  benchmarkPositioningFrame: "Customer Operations and Support Strategy leader",
  notes: "Customer operations benchmark for workflow clarity and service-quality framing.",
  approvedBenchmarkResume: {
    summary:
      "Customer operations and support strategy leader focused on support operations rigor, domain and customer context, process and workflow design, and cross-functional leadership. Builds operating cadences that make support quality visible and easier to improve with customer operations leadership, support strategy, workflow design, and customer experience leadership.",
    bullets: [
      "Directed customer operations leadership programs and improved service quality by clarifying queue ownership and support workflow design.",
      "Built operating reviews that connected backlog trends, customer pain points, and staffing tradeoffs for leadership.",
      "Partnered with product and support leaders on escalation process improvements and customer advocacy routines.",
      "Used cross functional leadership to keep service delivery visible and to close recurring process gaps.",
    ],
  },
  approvedBenchmarkCoverLetter: {
    opening:
      "I am applying for the Customer Operations and Support Strategy role because my background aligns with a team that wants stronger workflows, clearer operating rhythm, and visible service quality. I have worked in customer operations leadership settings where the goal was to make the service motion easier to run, easier to measure, and easier to improve. I have also built reporting routines that help leaders see where support strategy needs attention.",
    bodyParagraphs: [
      "I have led customer operations leadership, improved support strategy, and worked with product and support leaders to turn feedback into practical process improvements. In those settings I focused on queue clarity, workflow design, ownership paths, and the operating reviews that help leaders see where service quality is rising or slipping. That approach helps teams turn customer pain into concrete next steps.",
      "That experience helps me contribute quickly because I can bring operating discipline, customer experience leadership, and a clear way to keep the work measurable. I am comfortable translating customer pain points into action items, keeping the work visible to senior leaders, and helping teams stay aligned on what should happen next. I also know how to connect workflow design with staffing tradeoffs and service quality goals.",
    ],
    closingParagraph:
      "I would welcome a conversation about how I could support your customer operations and support strategy goals. My aim would be to help the team keep service quality visible, keep the workflow practical, and keep the customer experience steady as the business grows. I would be glad to help create a rhythm that is easy for the team to sustain.",
  },
};

export const SYNTHETIC_GENERATION_FIXTURES: SyntheticGenerationFixtureBundle[] = [
  {
    scenario: {
      id: "support-ops-director-strong-fit",
      title: "Support operations director",
      name: "Support operations director",
      personaKey: "support-ops-director",
      baselineFixtureId: SUPPORT_OPS_BASELINE.id,
      jobFixtureId: SUPPORT_OPS_JOB.id,
      benchmarkFixtureId: SUPPORT_OPS_BENCHMARK.fixtureId,
      baselineSourceArtifact: fixtureSourceArtifact(
        SUPPORT_OPS_BASELINE.id,
        "support operations baseline resume",
      ),
      targetSourceArtifact: fixtureSourceArtifact(
        SUPPORT_OPS_JOB.id,
        "support operations job description",
      ),
      tags: ["strong-fit", "generation-ready", "opportunity-handoff", "calibration-backed"],
      notes: ["Canonical support operations fit scenario."],
      expected: {
        minFitScore: 80,
        fitBand: "strong",
        generationMode: "generate",
        requiresResume: true,
        requiresCoverLetter: true,
        minRoleMatchReadiness: "ready",
        mustPassCalibrationBar: true,
        maxHighSeverityCalibrationGaps: 1,
        requiredRoleSignals: [
          "support operations rigor",
          "service reliability",
          "operating model design",
          "governance design",
          "ITSM process maturity",
          "automation workflows",
          "dashboards and KPIs",
          "voice of the customer",
          "customer advocacy",
          "team coordination",
          "capacity planning",
        ],
        bannedFailureStates: BANNED_FAILURE_STATES,
        journey: {
          results: "review",
          studio: "open",
          opportunity: "save",
        },
      },
    },
    baseline: SUPPORT_OPS_BASELINE,
    job: SUPPORT_OPS_JOB,
    benchmark: SUPPORT_OPS_BENCHMARK,
  },
  {
    scenario: {
      id: "incident-service-leader-strong-fit",
      title: "Incident and service delivery leader",
      name: "Incident and service delivery leader",
      personaKey: "incident-service-leader",
      baselineFixtureId: INCIDENT_BASELINE.id,
      jobFixtureId: INCIDENT_JOB.id,
      benchmarkFixtureId: INCIDENT_BENCHMARK.fixtureId,
      baselineSourceArtifact: fixtureSourceArtifact(
        INCIDENT_BASELINE.id,
        "incident response baseline resume",
      ),
      targetSourceArtifact: fixtureSourceArtifact(
        INCIDENT_JOB.id,
        "incident operations job description",
      ),
      tags: ["strong-fit", "generation-ready", "calibration-backed"],
      notes: ["Canonical incident operations fit scenario."],
      expected: {
        minFitScore: 80,
        fitBand: "strong",
        generationMode: "generate",
        requiresResume: true,
        requiresCoverLetter: true,
        minRoleMatchReadiness: "ready",
        mustPassCalibrationBar: true,
        maxHighSeverityCalibrationGaps: 1,
        requiredRoleSignals: [
          "service delivery leadership",
          "incident response rigor",
          "process architecture",
          "cross-functional leadership",
        ],
        bannedFailureStates: BANNED_FAILURE_STATES,
        journey: {
          results: "review",
          studio: "open",
          opportunity: "save",
        },
      },
    },
    baseline: INCIDENT_BASELINE,
    job: INCIDENT_JOB,
    benchmark: INCIDENT_BENCHMARK,
  },
  {
    scenario: {
      id: "customer-ops-strategy-strong-fit",
      title: "Customer operations and support strategy",
      name: "Customer operations and support strategy",
      personaKey: "customer-ops-strategy",
      baselineFixtureId: CUSTOMER_OPS_BASELINE.id,
      jobFixtureId: CUSTOMER_OPS_JOB.id,
      benchmarkFixtureId: CUSTOMER_OPS_BENCHMARK.fixtureId,
      baselineSourceArtifact: fixtureSourceArtifact(
        CUSTOMER_OPS_BASELINE.id,
        "customer operations baseline resume",
      ),
      targetSourceArtifact: fixtureSourceArtifact(
        CUSTOMER_OPS_JOB.id,
        "customer operations job description",
      ),
      tags: ["strong-fit", "generation-ready", "calibration-backed"],
      notes: ["Canonical customer operations fit scenario."],
      expected: {
        minFitScore: 80,
        fitBand: "strong",
        generationMode: "generate",
        requiresResume: true,
        requiresCoverLetter: true,
        minRoleMatchReadiness: "ready",
        mustPassCalibrationBar: true,
        maxHighSeverityCalibrationGaps: 1,
        requiredRoleSignals: [
          "customer operations leadership",
          "support strategy",
          "workflow design",
          "customer experience leadership",
        ],
        bannedFailureStates: BANNED_FAILURE_STATES,
        journey: {
          results: "review",
          studio: "open",
          opportunity: "save",
        },
      },
    },
    baseline: CUSTOMER_OPS_BASELINE,
    job: CUSTOMER_OPS_JOB,
    benchmark: CUSTOMER_OPS_BENCHMARK,
  },
  {
    scenario: {
      id: "support-ops-manager-moderate-fit",
      title: "Support operations manager",
      name: "Support operations manager",
      personaKey: "support-ops-director",
      baselineFixtureId: SUPPORT_OPS_BASELINE.id,
      jobFixtureId: SUPPORT_MODERATE_JOB.id,
      benchmarkFixtureId: null,
      baselineSourceArtifact: fixtureSourceArtifact(
        SUPPORT_OPS_BASELINE.id,
        "support operations baseline resume",
      ),
      targetSourceArtifact: fixtureSourceArtifact(
        SUPPORT_MODERATE_JOB.id,
        "support operations manager job description",
      ),
      tags: ["moderate-fit", "generation-ready", "studio-open"],
      notes: ["A moderate-fit support operations scenario for broader coverage."],
      expected: {
        minFitScore: 70,
        fitBand: "moderate",
        generationMode: "generate",
        requiresResume: true,
        requiresCoverLetter: true,
        minRoleMatchReadiness: "needs_tightening",
        mustPassCalibrationBar: false,
        maxHighSeverityCalibrationGaps: 2,
        requiredRoleSignals: [
          "support operations rigor",
          "workflow design",
          "queue health management",
          "cross-functional execution",
        ],
        bannedFailureStates: BANNED_FAILURE_STATES,
        journey: {
          results: "open",
          studio: "open",
          opportunity: "save",
        },
      },
    },
    baseline: SUPPORT_OPS_BASELINE,
    job: SUPPORT_MODERATE_JOB,
    benchmark: null,
  },
  {
    scenario: {
      id: "incident-response-coordinator-blocked",
      title: "Incident response coordinator",
      name: "Incident response coordinator",
      personaKey: "incident-service-leader",
      baselineFixtureId: INCIDENT_BASELINE.id,
      jobFixtureId: INCIDENT_BLOCKED_JOB.id,
      benchmarkFixtureId: null,
      baselineSourceArtifact: fixtureSourceArtifact(
        INCIDENT_BASELINE.id,
        "incident response baseline resume",
      ),
      targetSourceArtifact: fixtureSourceArtifact(
        INCIDENT_BLOCKED_JOB.id,
        "incident response coordinator job description",
      ),
      tags: ["blocked", "limited", "baseline-readiness"],
      notes: ["Intentional blocked scenario for baseline and studio readiness coverage."],
      expected: {
        minFitScore: 0,
        fitBand: "blocked",
        generationMode: "blocked",
        requiresResume: false,
        requiresCoverLetter: false,
        minRoleMatchReadiness: "misaligned",
        mustPassCalibrationBar: false,
        maxHighSeverityCalibrationGaps: 0,
        requiredRoleSignals: [
          "incident coordination",
          "escalation tracking",
          "service notes",
          "cross-functional communication",
        ],
        bannedFailureStates: BANNED_FAILURE_STATES,
        journey: {
          results: "blocked",
          studio: "blocked",
          opportunity: "not_applicable",
        },
      },
    },
    baseline: INCIDENT_BASELINE,
    job: INCIDENT_BLOCKED_JOB,
    benchmark: null,
  },
  {
    scenario: {
      id: "customer-operations-manager-weak-fit",
      title: "Customer operations manager",
      name: "Customer operations manager",
      personaKey: "customer-ops-strategy",
      baselineFixtureId: CUSTOMER_OPS_BASELINE.id,
      jobFixtureId: CUSTOMER_MODERATE_JOB.id,
      benchmarkFixtureId: null,
      baselineSourceArtifact: fixtureSourceArtifact(
        CUSTOMER_OPS_BASELINE.id,
        "customer operations baseline resume",
      ),
      targetSourceArtifact: fixtureSourceArtifact(
        CUSTOMER_MODERATE_JOB.id,
        "customer operations manager job description",
      ),
      tags: ["weak-fit", "generation-ready", "studio-limited"],
      notes: ["A weaker-fit customer operations scenario to cover the lower band."],
      expected: {
        minFitScore: 62,
        fitBand: "weak",
        generationMode: "generate",
        requiresResume: true,
        requiresCoverLetter: true,
        minRoleMatchReadiness: "needs_tightening",
        mustPassCalibrationBar: false,
        maxHighSeverityCalibrationGaps: 2,
        requiredRoleSignals: [
          "customer operations leadership",
          "workflow design",
          "service quality management",
          "customer experience leadership",
        ],
        bannedFailureStates: BANNED_FAILURE_STATES,
        journey: {
          results: "review",
          studio: "limited",
          opportunity: "save",
        },
      },
    },
    baseline: CUSTOMER_OPS_BASELINE,
    job: CUSTOMER_MODERATE_JOB,
    benchmark: null,
  },
];

export function listSyntheticGenerationScenarioBundles(): SyntheticGenerationFixtureBundle[] {
  return SYNTHETIC_GENERATION_FIXTURES.slice();
}

export function getSyntheticGenerationScenarioBundle(
  scenarioNameOrFixtureId: string,
): SyntheticGenerationFixtureBundle | null {
  return (
    SYNTHETIC_GENERATION_FIXTURES.find(
      (bundle) =>
        bundle.scenario.name === scenarioNameOrFixtureId ||
        bundle.scenario.baselineFixtureId === scenarioNameOrFixtureId ||
        bundle.scenario.jobFixtureId === scenarioNameOrFixtureId ||
        bundle.scenario.benchmarkFixtureId === scenarioNameOrFixtureId,
    ) ?? null
  );
}

export function listSyntheticGenerationScenarios(): SyntheticGenerationScenario[] {
  return SYNTHETIC_GENERATION_FIXTURES.map((bundle) => bundle.scenario);
}

export function getSyntheticGenerationScenario(
  scenarioNameOrFixtureId: string,
): SyntheticGenerationScenario | null {
  return getSyntheticGenerationScenarioBundle(scenarioNameOrFixtureId)?.scenario ?? null;
}

export function getSyntheticGenerationBaselineFixture(
  fixtureId: string,
): SyntheticGenerationBaselineFixture | null {
  return getSyntheticGenerationScenarioBundle(fixtureId)?.baseline ?? null;
}

export function getSyntheticGenerationJobFixture(
  fixtureId: string,
): SyntheticGenerationJobFixture | null {
  return getSyntheticGenerationScenarioBundle(fixtureId)?.job ?? null;
}

export function getSyntheticGenerationBenchmarkFixture(
  fixtureId: string,
): GoldStandardBenchmarkFixture | null {
  return getSyntheticGenerationScenarioBundle(fixtureId)?.benchmark ?? null;
}




