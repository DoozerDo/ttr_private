import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { isPublicRoute } from './public-routes';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    if (isPublicRoute(context)) {
      return true;
    }
    return super.canActivate(context);
  }
}
