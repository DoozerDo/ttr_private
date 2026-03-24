export interface JobDto {
  id: string;
  userId: string;
  title: string | null;
  company: string | null;
  rawDescription: string;
  description?: string;
  sourceUrl: string | null;
  normalizedResponsibilities: string[];
  normalizedRequirements: string[];
  jdIngestionMethod: "PASTE" | "URL";
  jdParsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  isArchived?: boolean;
  warning?: JobWarning | null;
}

export type JobWarning = {
  status: number;
  code: string;
  message: string;
  details?: string | null;
};
