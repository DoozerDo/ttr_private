import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class AdminBypassGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.ADMIN_BYPASS === 'true') {
      return true;
    }

    // Future: inspect the authenticated user on the request and
    // verify existence in admin_users before allowing access.
    throw new ForbiddenException(
      'Admin access is restricted until authentication is configured.',
    );
  }
}
