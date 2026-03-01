import { NextFunction, Request, Response } from 'express';

export function requestLoggerMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  console.log(`REQ ${req.method} ${req.originalUrl ?? req.url}`);
  next();
}
