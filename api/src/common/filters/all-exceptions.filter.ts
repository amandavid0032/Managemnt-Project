import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
  meta: { requestId: string; timestamp: string; path: string };
}

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

/**
 * Single exit point for every error.
 *
 * Internal detail — stack traces, driver messages, SQL — is logged server-side
 * and NEVER returned to the client. The previous Express backend returned
 * `err.message` verbatim, which leaked internals.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = (req.headers['x-request-id'] as string) ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_CODES[status] ?? 'HTTP_ERROR';
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const body = payload as { message?: unknown; error?: unknown; code?: unknown };
        if (Array.isArray(body.message)) {
          // class-validator produces an array of constraint messages.
          code = 'VALIDATION_ERROR';
          message = 'Request validation failed';
          details = body.message;
        } else if (typeof body.message === 'string') {
          message = body.message;
        }
        if (typeof body.code === 'string') code = body.code;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Map known DB errors to safe, generic client responses.
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          code = 'CONFLICT';
          message = 'A record with these values already exists';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          code = 'NOT_FOUND';
          message = 'Resource not found';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          code = 'DATABASE_ERROR';
          message = 'The request could not be processed';
      }
      this.logger.error(`Prisma ${exception.code} on ${req.method} ${req.url}`);
    }

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      success: false,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
      meta: { requestId, timestamp: new Date().toISOString(), path: req.url },
    };

    res.status(status).json(body);
  }
}
