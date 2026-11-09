import { Handler, NextFunction, Request, Response } from "express";
import { ErrForbidden, ErrUnauthorized } from "../app-error";
import { Requester, UserRole } from "../interface";

/**
 * Role-based authorization middleware.
 * Adapted from sample: updated role enum to FARMER/TRADER/ADMIN.
 */
export function allowRoles(roles: UserRole[]): Handler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!res.locals.requester) {
      return next(ErrUnauthorized);
    }

    const requester = res.locals.requester as Requester;

    if (!roles.includes(requester.role)) {
      return next(
        ErrForbidden.withLog(`User ${requester.sub} has role ${requester.role}, required: ${roles.join(',')}`)
      );
    }

    next();
  };
}
