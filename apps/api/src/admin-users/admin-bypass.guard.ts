import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminUsersService } from './admin-users.service';
import { isFounderEmail } from '../auth/founder-access';

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
    let req: any;
    let candidateId = '';
    let authedUserId = '';
    let route = '';

    try {
      req = context.switchToHttp().getRequest<any>();
      route = req?.url ?? req?.originalUrl ?? 'unknown';

      const nodeEnv =
        this.config.get<string>('NODE_ENV') ??
        process.env.NODE_ENV ??
        'development';

      const isProd = nodeEnv === 'production';

      const normalizeCandidate = (value: unknown) =>
        value != null ? String(value).trim() : '';

      const userIdCandidate = normalizeCandidate(req?.user?.userId);
      const idCandidate = normalizeCandidate(req?.user?.id);
      const subCandidate = normalizeCandidate(req?.user?.sub);
      const emailCandidate = normalizeCandidate(req?.user?.email);

      const userCandidates = [userIdCandidate, idCandidate, subCandidate].filter(
        Boolean,
      );

      authedUserId = userCandidates[0] ?? '';

      const isFounder = isFounderEmail(
        emailCandidate,
        this.config.get<string>('FOUNDER_EMAILS'),
      );
      if (isFounder) {
        return true;
      }

      const rawDevHeader = req?.headers?.['x-dev-user-id'];
      const devUserId =
        !isProd && typeof rawDevHeader === 'string'
          ? rawDevHeader.trim()
          : !isProd && Array.isArray(rawDevHeader) && rawDevHeader[0]
            ? String(rawDevHeader[0]).trim()
            : '';

      const candidateFromUser = userCandidates[0] ?? '';
      candidateId = isProd ? candidateFromUser : devUserId || candidateFromUser;

      const reqUserKeys = req?.user ? Object.keys(req.user) : [];
      const logDebugInfo = (reason: string) => {
        if (isProd) {
          return;
        }
        const keys = reqUserKeys.length ? reqUserKeys.join(',') : 'none';
        this.logger.debug(
          `AdminBypassGuard debug (${reason}) userKeys=[${keys}] route=${route}`,
        );
      };

      if (!candidateId) {
        logDebugInfo('missing_candidate');
        if (isProd) {
          throw new ForbiddenException(
            'Admin access is restricted until authentication is configured.',
          );
        }
        throw new ForbiddenException('Admin access required');
      }

      const isAdmin = await this.adminUsersService.isAdmin(candidateId);

      if (!isAdmin) {
        logDebugInfo('not_admin');
        throw new ForbiddenException('Admin access required');
      }

      return true;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      const actor = candidateId || authedUserId || 'unknown';
      const reason = 'admin_bypass_denied';
      this.logger.warn(
        `AdminBypassGuard denied (${reason}) actor=${actor} route=${route}: ${msg}`,
      );

      if (err instanceof ForbiddenException) {
        throw err;
      }

      throw new ForbiddenException('Admin access required');
    }
  }
}
