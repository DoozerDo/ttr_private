import type { InterviewQuestion } from "./interviews";
import apiRoutes from "./apiRoutes.json";

export type StudyPacket = {
  job: { id: string; title: string | null; company: string | null };
  fitSnapshot: {
    assessmentId: string;
    baselineId: string;
    overallScore: number;
    verdict: string;
    strengths: string[];
    gaps: string[];
    criticalGaps: Array<{
      gapId: string;
      title: string;
      description: string;
      severityScore: number;
      requirementEvidence: string;
      baselineEvidence: string | null;
      reasoning: string;
    }>;
    recommendedActions: string[];
    createdAt: string;
  } | null;
  interviewRiskBriefing: Array<{
    riskId: string;
    topic: string;
    whyTheyMayChallengeYou: string;
    howToAddressIt: string;
    exampleTalkingPoint: string;
    suggestedTalkingPoints: string[];
    exampleResponseStrategies: string[];
  }>;
  recommendedStories: StarStory[];
  recentStories: StarStory[];
  questions: InterviewQuestion[];
};

export type StarStory = {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflections: string | null;
  competencies: string[];
  createdAt: string;
  updatedAt: string;
};

export type FollowUpPayload = {
  content: string;
  complianceFlags?: Array<{ code?: string; message?: string; severity?: string }>;
  job: { id: string; title: string | null; company: string | null };
  auditId?: string;
  baselineVersionHash?: string | null;
};

const API_ROUTES = {
  interviewToolkitStudyPacket: apiRoutes.interviewToolkitStudyPacket,
};

function studyPacketPath(jobId: string): string {
  return API_ROUTES.interviewToolkitStudyPacket.replace(
    "{jobId}",
    encodeURIComponent(jobId),
  );
}

export class StudyPacketError extends Error {
  endpoint: string;
  status?: number;
  contentType?: string;

  constructor(message: string, props: { endpoint: string; status?: number; contentType?: string }) {
    super(message);
    this.endpoint = props.endpoint;
    this.status = props.status;
    this.contentType = props.contentType;
  }
}

export async function fetchStudyPacket(jobId: string): Promise<StudyPacket> {
  const endpoint = studyPacketPath(jobId);
  const response = await fetch(endpoint, {
    cache: "no-store",
  });

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const payloadText = (await response.text()).trim();
  const isHtml = contentType.includes("text/html");

  if (!response.ok) {
    const message = isHtml
      ? "Received HTML instead of JSON. Likely missing route or auth redirect."
      : `Study packet request failed with status ${response.status}.`;
    throw new StudyPacketError(message, {
      endpoint,
      status: response.status,
      contentType,
    });
  }

  if (isHtml) {
    throw new StudyPacketError(
      "Received HTML instead of JSON. Likely missing route or auth redirect.",
      {
        endpoint,
        status: response.status,
        contentType,
      },
    );
  }

  if (!payloadText) {
    throw new StudyPacketError("Study packet response was empty.", {
      endpoint,
      status: response.status,
      contentType,
    });
  }

  const parseJson = (): StudyPacket => {
    try {
      return JSON.parse(payloadText) as StudyPacket;
    } catch {
      throw new StudyPacketError("Study packet response is not valid JSON.", {
        endpoint,
        status: response.status,
        contentType,
      });
    }
  };

  if (contentType.includes("application/json")) {
    return parseJson();
  }

  return parseJson();
}
