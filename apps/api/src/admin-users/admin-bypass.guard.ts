import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminUsersService } from './admin-users.service';

/**
 * Dev-only admin access:
 * - In non-production, accepts x-dev-user-id and validates membership in admin_users table.
 * - In production, blocks all access until real authentication is wired (req.user).
 *
 * This replaces the old ADMIN_BYPASS behavior without reintroducing a global bypass.
 */
@Injectable()
export class AdminBypassGuard implements CanActivate {
  private readonly logger = new Logger(AdminBypassGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly adminUsersService: AdminUsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const req = context.switchToHttp().getRequest<any>();

      const nodeEnv =
        this.config.get<string>('NODE_ENV') ??
        process.env.NODE_ENV ??
        'development';

      const isProd = nodeEnv === 'production';

      // Future auth integration path
      const authedUserId =
        req?.user?.id != null ? String(req.user.id).trim() : '';

      // Dev-only header (ignored in production)
      const rawDevHeader = req?.headers?.['x-dev-user-id'];
      const devUserId =
        !isProd && typeof rawDevHeader === 'string'
          ? rawDevHeader.trim()
          : !isProd && Array.isArray(rawDevHeader) && rawDevHeader[0]
            ? String(rawDevHeader[0]).trim()
            : '';

      // In prod: only accept authenticated user id
      // In dev: accept header first, then fallback to authenticated user id if present
      const candidateId = isProd ? authedUserId : devUserId || authedUserId;

      if (!candidateId) {
        if (isProd) {
          throw new ForbiddenException(
            'Admin access is restricted until authentication is configured.',
          );
        }
        throw new ForbiddenException('Admin access required');
      }

      const isAdmin = await this.adminUsersService.isAdmin(candidateId);

      if (!isAdmin) {
        throw new ForbiddenException('Admin access required');
      }

      return true;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      this.logger.warn(`AdminBypassGuard denied: ${msg}`);

      if (err instanceof ForbiddenException) {
        throw err;
      }

      // Never crash the request path
      throw new ForbiddenException('Admin access required');
    }
  }
}
