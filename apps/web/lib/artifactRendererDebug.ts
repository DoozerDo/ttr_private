type ArtifactType = "resume" | "cover_letter" | "unknown";

export type ArtifactRendererDebugEvent = {
  page: "results" | "studio";
  artifactType: ArtifactType;
  confidence: string | null;
  generationPhase: string | null;
  pairStatus: string | null;
  renderer: string;
  previewLength: number;
  totalBodyLength: number;
  truncated: boolean;
  reason: string;
};

export function devLogArtifactRendererSelection(event: ArtifactRendererDebugEvent) {
  if (process.env.NODE_ENV !== "development") return;
  console.debug("[artifactRenderer]", event);
}

