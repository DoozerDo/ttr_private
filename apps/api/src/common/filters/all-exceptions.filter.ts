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

    const stack =
      exception && typeof exception === 'object' && 'stack' in exception
        ? safeStack(exception)
        : '';

    this.logger.error(
      `Unhandled exception ${method} ${path} -> ${status}: ${String(message)}`,
      stack,
    );

    // If headers already went out, we cannot write a clean JSON body.
    // End the response to avoid hanging sockets.
    if (res?.headersSent) {
      try {
        res.end();
      } catch {
        // ignore
      }
      return;
    }

    res.status(status).json({
      statusCode: status,
      error,
      message,
      path,
      timestamp: new Date().toISOString(),
    });
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
  if (isObjectRecord(responseBody) && typeof responseBody.error === 'string') {
    return responseBody.error;
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
