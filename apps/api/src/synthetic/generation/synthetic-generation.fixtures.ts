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

const SUPPORT_OPS_BASELINE: SyntheticGenerationBaselineFixture = {
  id: "baseline-support-ops-director-v1",
  originalFilename: "support-ops-director-baseline.txt",
  storagePath: "synthetic://generation/support-ops-director/baseline_v1",
  version: 1,
  sections: [
    {
      id: "support-ops-section-1",
      title: "Support Operations Leadership",
      sectionType: "EXPERIENCE",
      content:
        "Led support operations programs for a SaaS product team, improving SLA adherence, reducing repeat escalations, and building a steadier operating rhythm for frontline managers. Partnered with support leads on queue health reviews, coaching, and quality calibration so service delivery stayed predictable during peak demand.",
    },
    {
      id: "support-ops-section-2",
      title: "Workflow And Incident Design",
      sectionType: "EXPERIENCE",
      content:
        "Built intake, triage, and escalation workflows that clarified ownership across support, product, and engineering. Introduced incident response routines and playbooks that shortened handoff delays and made recurring issues easier to route to the right teams.",
    },
    {
      id: "support-ops-section-3",
      title: "Cross-Functional Execution",
      sectionType: "EXPERIENCE",
      content:
        "Created weekly operating reviews with customer success, product, and engineering to align on service quality, staffing tradeoffs, and root-cause action items. Used dashboards and process notes to connect support operations rigor with broader customer experience leadership.",
    },
  ],
  allowedCompanies: ["Example SaaS", "Acme", "Northwind Support"],
  allowedRoles: ["Support Operations Director", "Director of Support Operations", "Customer Operations Director"],
  allowedTechnologies: ["Zendesk", "SQL", "Looker", "Jira"],
  allowedMetricTokens: ["SLA", "CSAT", "backlog", "response time"],
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
        "Built process architecture that connected triage, ownership, and follow-through so service delivery moved faster across teams. Documented the escalation paths and review rhythm needed to keep support operations aligned with reliability goals.",
    },
    {
      id: "incident-section-3",
      title: "Leadership And Coordination",
      sectionType: "EXPERIENCE",
      content:
        "Partnered with product and engineering on service delivery priorities, incident postmortems, and recurring issue reduction. Used cross-functional leadership to keep the work visible and to make follow-up actions more consistent.",
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
  rawDescription:
    "Lead support operations, incident response, process architecture, and cross-functional execution for a scaling SaaS team. Own queue health, service quality, escalation routines, and operating rhythms that keep support predictable.",
  normalizedResponsibilities: [
    "Own support operations strategy and queue health.",
    "Improve incident response and escalation workflow quality.",
    "Partner with product and engineering on root cause fixes.",
    "Lead cross-functional operating reviews.",
  ],
  normalizedRequirements: [
    "Support operations rigor",
    "Incident management leadership",
    "Process architecture",
    "Cross-functional execution",
  ],
};

const INCIDENT_JOB: SyntheticGenerationJobFixture = {
  id: "job-incident-service-leader-v1",
  title: "Service Delivery and Incident Operations Leader",
  company: "Example SaaS",
  rawDescription:
    "Lead service delivery and incident response across support and engineering. Design the operating rhythm for escalations, triage, postmortems, and customer-facing recovery so teams move quickly when the queue gets noisy.",
  normalizedResponsibilities: [
    "Own service delivery execution and incident response discipline.",
    "Build escalation and triage routines for support and engineering.",
    "Improve postmortem follow-through and recurring issue reduction.",
    "Partner cross-functionally on operating cadence and service quality.",
  ],
  normalizedRequirements: [
    "Service delivery leadership",
    "Incident response rigor",
    "Process architecture",
    "Cross-functional leadership",
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

const SUPPORT_OPS_BENCHMARK = {
  fixtureId: "support-ops-director-benchmark-v1",
  baselineId: SUPPORT_OPS_BASELINE.id,
  jobId: SUPPORT_OPS_JOB.id,
  scenarioName: "Support operations director",
  benchmarkPositioningFrame: "Customer Operations and Support Strategy leader",
  notes: "Strong benchmark for support workflow rigor, early proof, and additive cover-letter framing.",
  approvedBenchmarkResume: {
    summary:
      "Customer Operations and Support Strategy leader focused on support operations rigor, workflow design, and cross-functional execution. Leads intake, triage, and escalation systems that improve service quality and make the queue easier to run.",
    bullets: [
      "Led support operations for a high-volume service team and built intake, triage, and escalation routines that reduced repeat tickets.",
      "Worked with product and engineering partners to prioritize root-cause fixes and stabilize the most frequent incident paths.",
      "Built weekly operating reviews that connected queue health, service quality, and staffing decisions for leadership.",
      "Documented escalation playbooks and ownership paths so cross-functional response was faster and more predictable.",
    ],
  },
  approvedBenchmarkCoverLetter: {
    opening:
      "I am applying for Support Operations Manager because my background fits a team that needs stronger support workflows, clearer escalation routines, and steady cross-functional follow-through.",
    bodyParagraphs: [
      "In my recent work, I have led support operations, improved service reliability, and partnered with product and engineering to remove recurring customer pain points.",
      "That combination lets me contribute quickly without repeating the resume: I can bring operating discipline, clearer workflow ownership, and practical coordination across teams.",
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
      "Service delivery and incident operations leader focused on support operations rigor, service delivery and incident response, cross-functional leadership, and process and workflow design. Builds operating rhythms that shorten response time and improve how teams handle escalations with incident response rigor and process architecture.",
    bullets: [
      "Led service delivery leadership work for customer facing services and built incident response rigor into escalation triage across support and engineering.",
      "Built process architecture that clarified ownership, reduced handoff delays, and improved service recovery after major incidents.",
      "Created operating cadences that kept recurring issues visible and made follow through easier for cross functional leadership.",
      "Partnered with support, product, and engineering to keep incident response disciplined and customer communication clear.",
    ],
  },
  approvedBenchmarkCoverLetter: {
    opening:
      "I am applying for this role because my work has centered on service delivery leadership, incident response rigor, and process architecture. I have helped support and engineering partners stay aligned during urgent moments, and I know how to keep customer recovery work organized without losing sight of the team rhythm. I have also led operating reviews that made escalation ownership and service follow through visible to the whole team.",
    bodyParagraphs: [
      "My strongest contribution is the combination of incident response rigor and process clarity. I have helped teams reduce handoff friction, tighten follow through, and keep service recovery visible by making the next owner, the next action, and the expected timeline easy for everyone to see. That discipline helps teams protect service quality while keeping response time steady. It also gives managers a calmer way to work through the busiest incidents.",
      "I also bring a practical approach to cross functional leadership. I have used review cadences, escalation paths, and simple operating notes to keep support, product, and engineering aligned on what matters most. That makes it easier to address recurring issues, communicate with confidence, and keep the service model moving in the same direction. It also helps the team turn postmortem follow up into real service delivery improvements.",
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
      name: "Support operations director",
      baselineFixtureId: SUPPORT_OPS_BASELINE.id,
      jobFixtureId: SUPPORT_OPS_JOB.id,
      benchmarkFixtureId: SUPPORT_OPS_BENCHMARK.fixtureId,
      expected: {
        minFitScore: 80,
        requiresResume: true,
        requiresCoverLetter: true,
        minRoleMatchReadiness: "ready",
        mustPassCalibrationBar: true,
        maxHighSeverityCalibrationGaps: 1,
        requiredRoleSignals: [
          "support operations rigor",
          "service delivery and incident response",
          "process architecture",
          "cross-functional execution",
        ],
        bannedFailureStates: BANNED_FAILURE_STATES,
      },
    },
    baseline: SUPPORT_OPS_BASELINE,
    job: SUPPORT_OPS_JOB,
    benchmark: SUPPORT_OPS_BENCHMARK,
  },
  {
    scenario: {
      name: "Incident and service delivery leader",
      baselineFixtureId: INCIDENT_BASELINE.id,
      jobFixtureId: INCIDENT_JOB.id,
      benchmarkFixtureId: INCIDENT_BENCHMARK.fixtureId,
      expected: {
        minFitScore: 80,
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
      },
    },
    baseline: INCIDENT_BASELINE,
    job: INCIDENT_JOB,
    benchmark: INCIDENT_BENCHMARK,
  },
  {
    scenario: {
      name: "Customer operations and support strategy",
      baselineFixtureId: CUSTOMER_OPS_BASELINE.id,
      jobFixtureId: CUSTOMER_OPS_JOB.id,
      benchmarkFixtureId: CUSTOMER_OPS_BENCHMARK.fixtureId,
      expected: {
        minFitScore: 80,
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
      },
    },
    baseline: CUSTOMER_OPS_BASELINE,
    job: CUSTOMER_OPS_JOB,
    benchmark: CUSTOMER_OPS_BENCHMARK,
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
