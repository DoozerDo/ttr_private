import { Inject, Injectable } from '@nestjs/common';
import { JobSourceProvider } from './job-source.provider';
import { JOB_SOURCE_PROVIDERS } from './job-source.constants';
import { JobSourceInput } from './job-source.types';

@Injectable()
export class JobSourceRegistry {
  constructor(
    @Inject(JOB_SOURCE_PROVIDERS)
    private readonly providers: JobSourceProvider[],
  ) {}

  findProvider(input: JobSourceInput): JobSourceProvider | null {
    return this.providers.find((provider) => provider.canHandle(input)) ?? null;
  }
}
