import jwt from "jsonwebtoken";
import { AppError, ErrUnauthorized } from "../app-error";
import { config } from "./config";
import { ITokenVerifier, TokenPayload, UserRole } from "../interface";

/**
 * RS256 JWT Verifier (BA-SOA §3).
 * Validates access tokens issued by User Service.
 * Trading Service only holds the public key (verify-only).
 */
export class JWTVerifier implements ITokenVerifier {
  constructor(
    private readonly publicKey: string = config.jwt.publicKey,
    private readonly issuer: string = config.jwt.issuer,
    private readonly audience: string = config.jwt.audience,
  ) {}

  async verify(token: string): Promise<TokenPayload> {
    if (!this.publicKey) {
      throw AppError.from(ErrUnauthorized, 401)
        .withCode("UNAUTHORIZED")
        .withLog("JWT public key is not configured");
    }

    try {
      const decoded = jwt.verify(token, this.publicKey, {
        algorithms: ["RS256"],
        issuer: this.issuer,
        audience: this.audience,
        clockTolerance: 60, // 60 seconds clock skew tolerance (BA-SOA §19)
      }) as any;

      if (!decoded || !decoded.sub || !decoded.role) {
        throw AppError.from(ErrUnauthorized, 401)
          .withCode("UNAUTHORIZED")
          .withLog("Token claims missing required sub or role");
      }

      return {
        sub: decoded.sub,
        role: decoded.role as UserRole,
        iat: decoded.iat,
        exp: decoded.exp,
        jti: decoded.jti,
      };
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      throw AppError.from(ErrUnauthorized, 401)
        .withCode("UNAUTHORIZED")
        .withLog(`JWT verification failed: ${error?.message || error}`);
    }
  }
}

