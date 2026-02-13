import { InterviewQuestionGroup } from "@/lib/interviewToolkit/questions";

export const INTERVIEW_FOCUS_TAGS = [
  "leadership",
  "strategy",
  "platform",
  "domain",
  "operations",
  "communication",
  "incident_management",
] as const;

export type InterviewFocusTag = (typeof INTERVIEW_FOCUS_TAGS)[number];

const KEYWORD_RULES: Array<{
  tag: InterviewFocusTag;
  patterns: RegExp[];
}> = [
  { tag: "leadership", patterns: [/leadership/i] },
  { tag: "strategy", patterns: [/strategy/i, /strategic/i] },
  {
    tag: "platform",
    patterns: [/platform/i, /tooling/i, /technology/i, /stack/i, /system/i],
  },
  {
    tag: "domain",
    patterns: [/industry/i, /domain/i, /context/i, /market/i],
  },
  {
    tag: "operations",
    patterns: [/process/i, /operations/i, /rigor/i, /execution/i],
  },
  {
    tag: "communication",
    patterns: [/communication/i, /stakeholder/i, /collaboration/i, /present/i],
  },
  {
    tag: "incident_management",
    patterns: [/incident/i, /escalation/i, /outage/i, /incident management/i],
  },
];

export function mapTextToInterviewFocusTag(text: string): InterviewFocusTag | null {
  const normalized = text?.trim();
  if (!normalized) return null;
  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return rule.tag;
    }
  }
  return null;
}

export const FOCUS_TAG_TO_GROUP: Record<InterviewFocusTag, InterviewQuestionGroup> = {
  leadership: "Leadership and ownership",
  strategy: "Strategy and decision-making",
  platform: "Execution and operations",
  domain: "Customer impact and escalation",
  operations: "Execution and operations",
  communication: "Customer impact and escalation",
  incident_management: "Customer impact and escalation",
};

export function focusTagToQuestionGroup(tag?: string | null): InterviewQuestionGroup | null {
  if (!tag) return null;
  if (!INTERVIEW_FOCUS_TAGS.includes(tag as InterviewFocusTag)) {
    return null;
  }
  return FOCUS_TAG_TO_GROUP[tag as InterviewFocusTag];
}
