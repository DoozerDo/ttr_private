import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const path = req?.url ?? '';
    const method = req?.method ?? '';

    const responseBody = isHttp ? exception.getResponse() : undefined;
    const message = isHttp
      ? resolveErrorMessage(responseBody, exception)
      : 'Internal server error';
    const error = isHttp ? resolveErrorLabel(responseBody) : 'Error';

    if (typeof path === 'string' && path.includes('/support/report-bug') && status >= 400) {
      const user = (req as unknown as { user?: Record<string, unknown> })?.user;
      const userId =
        (typeof user?.id === 'string' && user.id) ||
        (typeof user?.userId === 'string' && user.userId) ||
        null;

      const rawBody = (req as unknown as { body?: unknown })?.body;
      const payloadKeys =
        rawBody && typeof rawBody === 'object'
          ? Object.keys(rawBody as Record<string, unknown>)
          : [];

      const bodyRecord =
        rawBody && typeof rawBody === 'object' ? (rawBody as Record<string, unknown>) : null;

      const hasMessage = typeof bodyRecord?.message === 'string';
      const hasDescription = typeof bodyRecord?.description === 'string';
      const messageLengthRaw =
        typeof bodyRecord?.message === 'string'
          ? bodyRecord.message.trim().length
          : typeof bodyRecord?.description === 'string'
            ? bodyRecord.description.trim().length
            : null;

      const code =
        isObjectRecord(responseBody) && typeof responseBody.code === 'string'
          ? responseBody.code
          : null;

      const logPayload = {
        event: 'support_report_bug_failure',
        method,
        path,
        status,
        userId,
        payloadKeys,
        messageLength: messageLengthRaw,
        hasLegacyDescription: hasDescription && !hasMessage,
        code,
        reason: String(message),
      };

      if (status >= 500) {
        this.logger.error(logPayload);
      } else {
        this.logger.warn(logPayload);
      }
    }

    const stack =
      exception && typeof exception === 'object' && 'stack' in exception
        ? safeStack(exception)
        : '';

    this.logger.error(
      `Unhandled exception ${method} ${path} -> ${status}: ${String(message)}`,
      stack,
    );

    if (res?.headersSent) {
      try {
        res.end();
      } catch {
        // ignore
      }
      return;
    }

    const base = {
      statusCode: status,
      error,
      message,
      path,
      timestamp: new Date().toISOString(),
    };

    if (isHttp) {
      const rb = exception.getResponse();

      if (isObjectRecord(rb)) {
        res.status(status).json({ ...base, ...rb });
        return;
      }

      if (typeof rb === 'string') {
        res.status(status).json({ ...base, message: rb });
        return;
      }
    }

    res.status(status).json(base);
  }
}

function resolveErrorMessage(
  responseBody: unknown,
  exception: HttpException,
): string {
  if (isObjectRecord(responseBody)) {
    const { message } = responseBody;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      return message.join(', ');
    }
  }
  return exception.message;
}

function resolveErrorLabel(responseBody: unknown): string {
  if (isObjectRecord(responseBody)) {
    const e = responseBody.error;
    if (typeof e === 'string') {
      return e;
    }
    if (isObjectRecord(e) && typeof e.code === 'string') {
      return e.code;
    }
  }
  return 'Error';
}

function safeStack(exception: unknown): string {
  if (isObjectRecord(exception) && typeof exception.stack === 'string') {
    return exception.stack;
  }
  return '';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
