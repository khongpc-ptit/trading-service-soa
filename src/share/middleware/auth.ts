import { Handler, NextFunction, Request, Response } from "express";
import { AppError, ErrAccountNotActive } from "../app-error";
import {
  IAccessStateRPC,
  ITokenIntrospect,
  ITokenVerifier,
  Requester,
} from "../interface";

/**
 * Authentication and access-state middleware (BA-SOA §3).
 *
 * Steps:
 * 1. Extract Bearer token from Authorization header.
 * 2. Verify token signature, expiration, issuer, audience using RS256 public key (or fallback introspector).
 * 3. Query User Service internal endpoint GET /internal/v1/accounts/{accountId}/access-state (1s timeout).
 * 4. Reject LOCKED, INACTIVE, UNVERIFIED accounts with 403 ACCOUNT_NOT_ACTIVE.
 * 5. Reject if access-state RPC times out / fails with 503 ACCESS_STATE_UNAVAILABLE.
 * 6. Attach verified identity to res.locals.requester.
 */
export function authMiddleware(
  source?: ITokenVerifier | ITokenIntrospect,
  accessStateRpc?: IAccessStateRPC,
): Handler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Get token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader?.split(" ")[1];

      if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!source) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // 2. Verify token (RS256 JWT or introspect adapter)
      let payload: Requester | null = null;

      if ("verify" in source) {
        payload = (await source.verify(token)) as Requester;
      } else if ("introspect" in source) {
        const result = await source.introspect(token);
        if (!result.isOk || !result.payload) {
          res
            .status(401)
            .json({ error: result.error?.message || "Unauthorized" });
          return;
        }
        payload = result.payload as Requester;
      }

      if (!payload || !payload.sub) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // 3. Check access-state in real-time (BA-SOA §3)
      if (accessStateRpc) {
        const state = await accessStateRpc.check(payload.sub);
        const upperStatus = (state.status || "").toUpperCase();

        if (
          !state.accessAllowed ||
          upperStatus === "LOCKED" ||
          upperStatus === "INACTIVE" ||
          upperStatus === "UNVERIFIED"
        ) {
          return next(
            AppError.from(ErrAccountNotActive, 403)
              .withCode("ACCOUNT_NOT_ACTIVE")
              .withLog(
                `Account ${payload.sub} access denied (status: ${state.status}, accessAllowed: ${state.accessAllowed})`,
              ),
          );
        }
      }

      // 4. Set requester in res.locals
      res.locals.requester = payload;

      return next();
    } catch (error: any) {
      if (error instanceof AppError) {
        if (
          error.getStatusCode() === 503 ||
          error.getStatusCode() === 403
        ) {
          return next(error);
        }
      }

      res.status(401).json({ error: error?.message || "Unauthorized" });
      return;
    }
  };
}
