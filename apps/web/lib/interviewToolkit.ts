import type { InterviewQuestion } from "./interviews";

export type StudyPacket = {
  job: { id: string; title: string | null; company: string | null };
  fitSnapshot: {
    assessmentId: string;
    baselineId: string;
    overallScore: number;
    verdict: string;
    strengths: string[];
    gaps: string[];
    createdAt: string;
  } | null;
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
