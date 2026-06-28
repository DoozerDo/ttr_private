import type { NextFunction, Request, Response } from 'express';
import {
  buildTimeoutResponseBody,
  GLOBAL_REQUEST_TIMEOUT_MS,
  resolveTimeoutOperation,
} from '../timeout';

const REQUEST_TIMEOUT_LOG_PREFIX = '[request-timeout]';

export function requestTimeoutMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const startedAt = Date.now();
  const originalUrl = req.originalUrl ?? req.url ?? '';
  const operation = resolveTimeoutOperation(originalUrl);
  const timer = setTimeout(() => {
    if (res.headersSent || res.writableEnded) {
      return;
    }

    const duration = Date.now() - startedAt;
    if (process.env.DEBUG_STUDIO_ARTIFACTS_ROUTE_TRACE === 'true' && originalUrl.includes('/studio/artifacts')) {
      // eslint-disable-next-line no-console
      console.warn(`${REQUEST_TIMEOUT_LOG_PREFIX} studio-artifacts-timeout`, {
        originalUrl,
        method: req.method,
        elapsedMs: duration,
        requestId:
          (req.headers['x-request-id'] as string | undefined) ??
          (req.headers['x-vercel-id'] as string | undefined) ??
          (req.headers['x-trace-id'] as string | undefined) ??
          null,
        headersSent: res.headersSent,
        writableEnded: res.writableEnded,
      });
    }
    console.warn(
      `${REQUEST_TIMEOUT_LOG_PREFIX} timeout operation=${operation} method=${req.method} path=${req.originalUrl ?? req.url} durationMs=${duration}`,
    );

    res.status(503).json({
      error: buildTimeoutResponseBody(operation),
    });
  }, GLOBAL_REQUEST_TIMEOUT_MS);

  res.on('finish', () => {
    clearTimeout(timer);
  });

  res.on('close', () => {
    clearTimeout(timer);
  });

  next();
}
