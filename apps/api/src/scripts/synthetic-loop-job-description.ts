import type { SyntheticGenerationFixtureBundle } from '../synthetic/generation/synthetic-generation.types';

function countWords(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function buildSyntheticLoopJobDescription(
  bundle: SyntheticGenerationFixtureBundle,
  runId: string,
) {
  const paragraphs = [
    bundle.job.rawDescription,
    `This role sits at the center of support operations rigor. It owns queue health, service delivery, escalation governance, capacity planning, operating model design, and the weekly operating rhythm used to keep support predictable for customers and internal partners. The leader is expected to translate service data into action, make ownership visible, and keep response time, SLA adherence, and customer advocacy in view when making staffing and process tradeoffs.`,
    `The role works across product, engineering, infrastructure, and customer success on incident response, problem management, change management, tooling roadmap decisions, and recurring issue reduction. The team relies on Zendesk, Jira, Salesforce Service Cloud, Linux infrastructure, monitoring, remote access, VPN, DNS, and DHCP. Strong candidates should be comfortable using dashboards and KPIs to guide prioritization, and they should know how to keep cross-functional follow through calm, practical, and measurable.`,
    `Success means coaching the team, running service reviews, keeping the voice of the customer visible, and building a support motion that is resilient enough to scale. In the first ninety days, the leader should make the operating rhythm easier to run, improve the visibility of escalation paths, and help the organization move from ad hoc coordination to reliable execution. Synthetic run id: ${runId}.`,
  ];

  const text = paragraphs.join('\n\n');
  return {
    text,
    wordCount: countWords(text),
  };
}
