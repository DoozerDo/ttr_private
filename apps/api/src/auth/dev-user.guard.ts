import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DevUserGuard implements CanActivate {
  private readonly logger = new Logger(DevUserGuard.name);

  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const nodeEnv =
      this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? 'development';
    const isProd = nodeEnv === 'production';

    try {
      const request = context.switchToHttp().getRequest<any>();

      const authedUserId =
        request?.user?.id != null ? String(request.user.id).trim() : '';

      const rawDevHeader = request?.headers?.['x-dev-user-id'];
      const devUserId =
        !isProd && typeof rawDevHeader === 'string'
          ? rawDevHeader.trim()
          : !isProd && Array.isArray(rawDevHeader) && rawDevHeader[0]
          ? String(rawDevHeader[0]).trim()
          : '';

      const candidateId = isProd ? authedUserId : devUserId || authedUserId;

      if (!candidateId) {
        if (isProd) {
          throw new ForbiddenException(
            'User access is restricted until authentication is configured.',
          );
        }
        throw new ForbiddenException('User access required');
      }

      request.user = {
        ...(request.user ?? {}),
        id: candidateId,
      };

      return true;
    } catch (error: any) {
      const message = error?.message ?? String(error);
      const shouldWarn = isProd || !(error instanceof ForbiddenException);
      if (shouldWarn) {
        this.logger.warn(`DevUserGuard denied: ${message}`);
      } else {
        this.logger.debug(`DevUserGuard denied: ${message}`);
      }

      if (error instanceof ForbiddenException) {
        throw error;
      }

      throw new ForbiddenException('User access required');
    }
  }
}
