import { Request, Response } from "express";
import { ZodError } from "zod";

/**
 * Centralized application error class.
 * Follows sample's factory-method + fluent-wrapper pattern.
 * Adapted for BA-SOA error envelope: { timestamp, status, code, message, path, traceId? }
 */
export class AppError extends Error {
  private statusCode: number = 500;
  private code: string = 'INTERNAL_SERVER_ERROR';
  private rootCause?: Error;
  private details: Record<string, any> = {};
  private logMessage?: string;

  private constructor(err: Error, options?: ErrorOptions) {
    super(err.message, options);
  }

  // Factory method
  static from(err: Error, statusCode: number = 500): AppError {
    const appError = new AppError(err);
    appError.statusCode = statusCode;
    return appError;
  }

  getRootCause(): Error | null {
    if (this.rootCause) {
      return this.rootCause instanceof AppError ? this.rootCause.getRootCause() : this.rootCause;
    }
    return null;
  }

  // Wrapper
  wrap(rootCause: Error): AppError {
    const appError = AppError.from(this, this.statusCode);
    appError.code = this.code;
    appError.rootCause = rootCause;
    return appError;
  }

  // Fluent setters
  withCode(code: string): AppError {
    this.code = code;
    return this;
  }

  withDetail(key: string, value: any): AppError {
    this.details[key] = value;
    return this;
  }

  withLog(logMessage: string): AppError {
    this.logMessage = logMessage;
    return this;
  }

  getStatusCode(): number {
    return this.statusCode;
  }

  getCode(): string {
    return this.code;
  }

  /**
   * BA-SOA error envelope:
   * { timestamp, status, code, message, path, traceId? }
   */
  toJSON(path: string = '', isProduction: boolean = true) {
    const base: Record<string, any> = {
      timestamp: new Date().toISOString(),
      status: this.statusCode,
      code: this.code,
      message: this.message,
      path,
    };

    if (!isProduction) {
      const rootCause = this.getRootCause();
      base.rootCause = rootCause ? rootCause.message : undefined;
      base.details = Object.keys(this.details).length > 0 ? this.details : undefined;
      base.logMessage = this.logMessage;
    }

    return base;
  }
}

/**
 * Global error response handler.
 * Handles AppError, ZodError, and unknown errors.
 */
export const responseErr = (err: Error, req: Request, res: Response) => {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    console.error(err.stack);
  }

  const path = req.originalUrl || req.path || '';

  // 1. Known AppError
  if (err instanceof AppError) {
    const appErr = err as AppError;
    res.status(appErr.getStatusCode()).json(appErr.toJSON(path, isProduction));
    return;
  }

  // 2. Zod validation error → 400
  if (err instanceof ZodError) {
    const zErr = err as ZodError;
    const appErr = ErrInvalidRequest.wrap(zErr).withCode('VALIDATION_ERROR');

    zErr.issues.forEach((issue) => {
      appErr.withDetail(issue.path.join('.'), issue.message);
    });

    res.status(appErr.getStatusCode()).json(appErr.toJSON(path, isProduction));
    return;
  }

  // 3. Unknown error → 500
  const appErr = ErrInternalServer.wrap(err);
  res.status(appErr.getStatusCode()).json(appErr.toJSON(path, isProduction));
};

// ─── Pre-defined error sentinels ─────────────────────────

export const ErrInternalServer = AppError.from(
  new Error('Something went wrong, please try again later.'), 500
).withCode('INTERNAL_SERVER_ERROR');

export const ErrInvalidRequest = AppError.from(
  new Error('Invalid request'), 400
).withCode('VALIDATION_ERROR');

export const ErrUnauthorized = AppError.from(
  new Error('Unauthorized'), 401
).withCode('UNAUTHORIZED');

export const ErrForbidden = AppError.from(
  new Error('Forbidden'), 403
).withCode('FORBIDDEN');

export const ErrNotFound = AppError.from(
  new Error('Not found'), 404
).withCode('NOT_FOUND');

export const ErrAccountNotActive = AppError.from(
  new Error('Account is not active'), 403
).withCode('ACCOUNT_NOT_ACTIVE');

export const ErrAccessStateUnavailable = AppError.from(
  new Error('Cannot verify account state, please try again'), 503
).withCode('ACCESS_STATE_UNAVAILABLE');

export const ErrDependencyUnavailable = AppError.from(
  new Error('A required service is unavailable'), 503
).withCode('DEPENDENCY_UNAVAILABLE');
