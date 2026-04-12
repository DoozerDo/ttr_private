import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_SYNTHETIC_INGEST_TOKEN = 'synthetic-ingest-local';

@Injectable()
export class SyntheticIngestGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<any>();
    const configuredToken =
      this.configService.get<string>('SYNTHETIC_INGEST_TOKEN')?.trim() ||
      process.env.SYNTHETIC_INGEST_TOKEN?.trim() ||
      DEFAULT_SYNTHETIC_INGEST_TOKEN;
    const nodeEnv = (this.configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? '').trim();
    const acceptedTokens = new Set<string>([configuredToken]);
    if (nodeEnv !== 'production') {
      acceptedTokens.add(DEFAULT_SYNTHETIC_INGEST_TOKEN);
    }

    const providedToken = String(
      request?.headers?.['x-synthetic-ingest-token'] ?? request?.headers?.['X-Synthetic-Ingest-Token'] ?? '',
    ).trim();

    if (!providedToken || !acceptedTokens.has(providedToken)) {
      throw new ForbiddenException('Synthetic ingest token required');
    }

    return true;
  }
}
