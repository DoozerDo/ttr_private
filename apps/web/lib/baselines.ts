export type BaselineSectionType =
  | "RAW"
  | "SUMMARY"
  | "EXPERIENCE"
  | "PROJECT"
  | "SKILLS"
  | "EDUCATION"
  | "OTHER";

export type BaselineIncludePolicy = "always" | "optional" | "never";

export interface BaselineSectionDto {
  id: string;
  baselineId: string;
  sectionType: BaselineSectionType;
  title: string | null;
  content: string;
  includePolicy: BaselineIncludePolicy;
  order: number;
  createdAt: string;
  updatedAt: string;
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
