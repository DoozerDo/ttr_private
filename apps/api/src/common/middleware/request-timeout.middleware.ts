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
  const operation = resolveTimeoutOperation(req.originalUrl ?? req.url ?? '');
  const timer = setTimeout(() => {
    if (res.headersSent || res.writableEnded) {
      return;
    }

    const duration = Date.now() - startedAt;
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
