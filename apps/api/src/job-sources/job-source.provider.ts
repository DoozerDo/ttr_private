import {
  JobSourceInput,
  JobSourceListing,
  JobDetailRaw,
  ParsedJob,
} from './job-source.types';

export interface JobSourceProvider {
  id: string;
  canHandle(input: JobSourceInput): boolean;
  fetchListings(input: JobSourceInput): Promise<JobSourceListing[]>;
  fetchJobDetail(listing: JobSourceListing): Promise<JobDetailRaw>;
  parseJob(detail: JobDetailRaw): ParsedJob;
}
