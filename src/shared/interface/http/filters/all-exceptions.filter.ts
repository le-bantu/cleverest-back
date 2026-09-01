import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainException } from '@shared/kernel';

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  path: string;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toBody(exception, request.url);
    if (body.statusCode >= 500) {
      this.logger.error(`${request.method} ${request.url}`, exception as Error);
    }
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, path: string): ApiErrorBody {
    const base = { path, timestamp: new Date().toISOString() };

    if (exception instanceof DomainException) {
      return {
        ...base,
        statusCode: exception.httpStatus,
        error: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : ((res as { message?: string | string[] }).message ?? exception.message);
      return {
        ...base,
        statusCode: status,
        error: (res as { error?: string }).error ?? exception.name,
        message: Array.isArray(message) ? message.join(', ') : message,
        details: typeof res === 'object' ? res : undefined,
      };
    }

    return {
      ...base,
      statusCode: 500,
      error: 'InternalServerError',
      message: 'Unexpected error',
    };
  }
}
