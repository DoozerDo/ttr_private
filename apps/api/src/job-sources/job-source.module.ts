import { Module } from '@nestjs/common';
import { JobSourceFetchCacheService } from './job-source-fetch-cache.service';
import { JobSourceHttpService } from './job-source-http.service';
import { JobSourceRegistry } from './job-source-registry.service';
import { JOB_SOURCE_PROVIDERS } from './job-source.constants';
import { GreenhouseJobSourceProvider } from './providers/greenhouse.provider';

@Module({
  providers: [
    JobSourceRegistry,
    JobSourceFetchCacheService,
    JobSourceHttpService,

    // Register the concrete provider so Nest can construct it (inject cache, etc.)
    GreenhouseJobSourceProvider,

    // Nest does not support Angular-style multi providers.
    // Instead, bind the token to an array of providers.
    {
      provide: JOB_SOURCE_PROVIDERS,
      useFactory: (greenhouse: GreenhouseJobSourceProvider) => [greenhouse],
      inject: [GreenhouseJobSourceProvider],
    },
  ],
  exports: [
    JobSourceRegistry,
    JobSourceFetchCacheService,
    JOB_SOURCE_PROVIDERS,
  ],
})
export class JobSourcesModule {}
