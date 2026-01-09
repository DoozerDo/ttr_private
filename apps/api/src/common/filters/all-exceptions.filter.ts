import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<any>();
    const req = ctx.getRequest<any>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const path = req?.url ?? '';
    const method = req?.method ?? '';

    const message = isHttp
      ? (exception.getResponse() as any)?.message ?? exception.message
      : 'Internal server error';

    const error =
      isHttp ? (exception.getResponse() as any)?.error ?? 'Error' : 'Error';

    const stack =
      exception && typeof exception === 'object' && 'stack' in exception
        ? String((exception as any).stack)
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
