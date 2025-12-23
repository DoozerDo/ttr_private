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

export interface BaselineVersionDto {
  id: string;
  baselineId: string;
  versionNumber: number;
  fileHash: string | null;
  storagePath: string;
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
  versions?: BaselineVersionDto[];
}

export interface BaselineBlockDto {
  id: string;
  section_type: BaselineSectionType;
  title: string | null;
  content: string;
  include_tag: BaselineIncludePolicy;
  order_index: number;
}

export interface BaselineBlockPolicyResponse {
  baseline_version_id: string;
  baseline_version_hash: string | null;
  blocks: BaselineBlockDto[];
}
