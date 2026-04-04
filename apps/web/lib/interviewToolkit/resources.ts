export type InterviewResource = {
  id: string;
  title: string;
  url: string;
  kind: "article" | "video" | "tool" | "doc";
  tags?: string[];
};

const seedResources: InterviewResource[] = [
  {
    id: "1",
    title: "Cracking the PM Interview (Article)",
    url: "https://www.crackingthepminterview.com/",
    kind: "article",
    tags: ["product", "general"],
  },
  {
    id: "2",
    title: "Interviewing.io Mock Interview Platform",
    url: "https://interviewing.io/",
    kind: "tool",
    tags: ["engineering", "practice"],
  },
  {
    id: "3",
    title: "How to Answer the Tell Me About Yourself Question (Video)",
    url: "https://www.youtube.com/watch?v=XD5Ebi0s1Xs",
    kind: "video",
    tags: ["behavioral", "general"],
  },
  {
    id: "4",
    title: "Harvard Business Review Guide to Leading Teams",
    url: "https://hbr.org/",
    kind: "doc",
    tags: ["leadership", "strategy"],
  },
  {
    id: "5",
    title: "Google's Behavioral Interview Tips",
    url: "https://rework.withgoogle.com/print/guides/5721312655835136/",
    kind: "article",
    tags: ["behavioral", "general"],
  },
  {
    id: "6",
    title: "The Muse Salary & Interview Prep Toolkit",
    url: "https://www.themuse.com/advice/interview-prep-tools",
    kind: "tool",
    tags: ["prep", "general"],
  },
  {
    id: "7",
    title: "How to Prepare STAR Stories with Examples (Document)",
    url: "https://resources.workable.com/tutorial/star-method",
    kind: "doc",
    tags: ["behavioral", "story"],
  },
  {
    id: "8",
    title: "Ace the Tech Interview (Video Course Preview)",
    url: "https://www.educative.io/courses/grokking-the-coding-interview",
    kind: "video",
    tags: ["technical", "coding"],
  },
];

export function getSeedInterviewResources(): InterviewResource[] {
  return seedResources;
}

export function getInterviewResourcesForJob(jobId?: string | null): InterviewResource[] {
  if (!jobId) {
    return seedResources;
  }

  const normalized = jobId.toLowerCase();
  if (normalized.includes("support")) {
    return seedResources.filter((resource) =>
      resource.tags?.some((tag) => tag === "general" || tag === "prep"),
    );
  }

  return seedResources;
}
