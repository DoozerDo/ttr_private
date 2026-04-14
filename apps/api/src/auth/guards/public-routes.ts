import type { ExecutionContext } from '@nestjs/common';

type HttpRequestLike = {
  method?: string;
  originalUrl?: string;
  url?: string;
};

function normalizePath(raw: string): string {
  const path = raw.split('?')[0] ?? '';
  if (!path) {
    return '';
  }

  // Some deployments mount the API behind a reverse proxy at `/api/*`.
  // Express will surface that prefix via `originalUrl`, so normalize it away.
  if (path === '/api') {
    return '/';
  }
  if (path.startsWith('/api/')) {
    return path.slice('/api'.length);
  }

  return path;
}

export function isPublicRequest(
  request: HttpRequestLike | undefined,
): boolean {
  const method = request?.method?.toUpperCase() ?? '';
  if (method === 'OPTIONS') {
    return true;
  }

  const url = normalizePath(request?.originalUrl ?? request?.url ?? '');

  if (url === '/' || url === '/health' || url === '/status' || url === '/version') {
    return true;
  }

  return (
    url === '/auth/register' ||
    url === '/auth/login' ||
    url === '/auth/forgot-password' ||
    url === '/auth/reset-password' ||
    url === '/auth/redeem-access-code-and-login' ||
    url === '/auth/confirm' ||
    url === '/auth/resend-confirmation' ||
    url === '/auth/logout' ||
    url === '/analytics/event' ||
    url === '/preview/compatibility-score'
  );
}

export function isPublicRoute(context: ExecutionContext): boolean {
  const request = context.switchToHttp().getRequest<HttpRequestLike>();
  return isPublicRequest(request);
}

