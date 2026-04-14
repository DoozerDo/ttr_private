import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessCodesService } from '../../access-codes/access-codes.service';
import { isFounderEmail } from '../founder-access';
import { isPublicRoute } from './public-routes';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly accessCodesService: AccessCodesService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublicRoute(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: { userId?: string; id?: string; sub?: string; email?: string };
    }>();
    const userId =
      request?.user?.userId?.trim() ||
      request?.user?.id?.trim() ||
      request?.user?.sub?.trim() ||
      '';
    const email = request?.user?.email?.trim() || '';

    if (
      isFounderEmail(
        email,
        this.configService.get<string>('FOUNDER_EMAILS'),
      )
    ) {
      return true;
    }

    if (!userId) {
      throw new ForbiddenException('Access code required');
    }

    const hasActiveAccess =
      await this.accessCodesService.userHasActiveAccess(userId);

    if (!hasActiveAccess) {
      throw new ForbiddenException('Access code required');
    }

    return true;
  }
}
