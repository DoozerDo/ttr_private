export type JobSourceInput = {
  sourceType: string;
  sourceUrl: string;
  options?: Record<string, unknown> | null;
};

export type JobSourceListing = {
  externalId: string;
  title: string;
  location?: string | null;
  url: string;
  postedAt?: Date | null;
};

export type JobDetailRaw = {
  url: string;
  html: string;
  fetchedAt: Date;
  metadata?: Record<string, unknown>;
};

export type ParsedJob = {
  title: string;
  company?: string | null;
  location?: string | null;
  descriptionText: string;
  responsibilities: string[];
  requirements: string[];
  applyUrl: string;
  sourceUrl: string;
  externalId: string;
};

export type SourceSnapshot = {
  sourceUrl: string | null;
  providerId: string;
  listingCount: number;
  fetchedAt: Date;
};
