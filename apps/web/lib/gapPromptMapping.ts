export type PromptSet = {
  category:
    | "workflow_process"
    | "qa_quality"
    | "training_enablement"
    | "metrics_reporting"
    | "tooling_systems"
    | "fallback";
  prompts: [string, string, string, string];
};

const PROMPT_SETS: Record<PromptSet["category"], PromptSet> = {
  workflow_process: {
    category: "workflow_process",
    prompts: [
      "Describe a time you improved or redesigned a workflow/process for this area.",
      "What was your role in defining and owning the process change?",
      "What teams or stakeholders were involved in making the workflow stick?",
      "What measurable outcome proved the new process worked?",
    ],
  },
  qa_quality: {
    category: "qa_quality",
    prompts: [
      "Describe a time you raised quality standards or reduced recurring issues.",
      "What quality controls or checks did you personally own?",
      "Which partners (support, engineering, operations, etc.) helped execute this?",
      "What quality metric improved as a result?",
    ],
  },
  training_enablement: {
    category: "training_enablement",
    prompts: [
      "Describe a time you enabled others through training, playbooks, or coaching.",
      "What part of the enablement plan did you own directly?",
      "Who were the audiences or teams involved?",
      "What performance improvement showed the enablement worked?",
    ],
  },
  metrics_reporting: {
    category: "metrics_reporting",
    prompts: [
      "Describe a time you built or improved metrics/reporting for decisions.",
      "What was your role in defining the KPI/measurement approach?",
      "Which teams consumed or acted on the reporting?",
      "What business or operational outcome improved from these metrics?",
    ],
  },
  tooling_systems: {
    category: "tooling_systems",
    prompts: [
      "Describe a time you implemented or optimized a tool/system relevant to this gap.",
      "What was your ownership in setup, configuration, or rollout?",
      "Which teams were affected and how did you coordinate with them?",
      "What measurable result proved the tooling change was successful?",
    ],
  },
  fallback: {
    category: "fallback",
    prompts: [
      "Describe a time this requirement showed up in your real work.",
      "What was your specific role and decision-making ownership?",
      "What teams or stakeholders were involved?",
      "What outcome proved success?",
    ],
  },
};

const CATEGORY_KEYWORDS: Array<{ category: PromptSet["category"]; keywords: string[] }> = [
  {
    category: "workflow_process",
    keywords: ["workflow", "process", "playbook", "sop", "triage", "escalation", "operations"],
  },
  {
    category: "qa_quality",
    keywords: ["qa", "quality", "defect", "audit", "accuracy", "compliance", "reliability"],
  },
  {
    category: "training_enablement",
    keywords: ["training", "enablement", "onboarding", "coaching", "mentoring", "readiness"],
  },
  {
    category: "metrics_reporting",
    keywords: ["metric", "kpi", "dashboard", "reporting", "analytics", "insight", "data"],
  },
  {
    category: "tooling_systems",
    keywords: ["tool", "system", "platform", "salesforce", "zendesk", "five9", "crm", "integration"],
  },
];

export function getPromptsForGap(gapLabel: string): PromptSet {
  const normalized = gapLabel.toLowerCase();
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      return PROMPT_SETS[entry.category];
    }
  }
  return PROMPT_SETS.fallback;
}
