import { Handler, NextFunction, Request, Response } from "express";
import { ErrForbidden } from "../app-error";

/**
 * Service-key authentication middleware for internal endpoints (/internal/**).
 * BA-SOA §4: Internal uses X-Service-Key, allowlist per caller.
 *
 * NEW file — not in sample (sample has no internal APIs).
 */
export function serviceKeyMiddleware(allowedKeys: string[]): Handler {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.headers['x-service-key'] as string | undefined;

    if (!key || !allowedKeys.includes(key)) {
      return next(
        ErrForbidden.withLog('Invalid or missing X-Service-Key for internal endpoint')
      );
    }

    next();
  };
}
