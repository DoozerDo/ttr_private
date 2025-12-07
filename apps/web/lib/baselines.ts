export type BaselineSectionType =
  | "summary"
  | "experience"
  | "skills"
  | "education"
  | "other";

export type BaselineIncludePolicy = "always" | "optional" | "never";

export interface BaselineSectionDto {
  id: string;
  baselineId: string;
  type: BaselineSectionType;
  content: string;
  includePolicy: BaselineIncludePolicy;
  orderIndex: number;
  createdAt: string;
}

export interface BaselineDto {
  id: string;
  userId: string;
  version: number;
  originalFilename: string;
  mimeType: string;
  storagePath: string;
  hash: string | null;
  createdAt: string;
  updatedAt: string;
  sections?: BaselineSectionDto[];
}
