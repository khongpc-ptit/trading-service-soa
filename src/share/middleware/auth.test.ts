import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { authMiddleware } from './auth';
import { allowRoles } from './check-role';
import {
  AccountAccessState,
  IAccessStateRPC,
  ITokenIntrospect,
  ITokenVerifier,
  TokenIntrospectResult,
  TokenPayload,
  UserRole,
} from '../interface';
import { Request, Response } from 'express';
import { AppError } from '../app-error';
import { JWTVerifier } from '../component/jwt';

class MockIntrospector implements ITokenIntrospect {
  constructor(
    public result: TokenIntrospectResult = {
      payload: { sub: 'user-123', role: UserRole.FARMER },
      isOk: true,
    },
  ) {}

  async introspect(_token: string): Promise<TokenIntrospectResult> {
    return this.result;
  }
}

class MockTokenVerifier implements ITokenVerifier {
  constructor(
    public payload: TokenPayload = {
      sub: 'user-123',
      role: UserRole.FARMER,
    },
    public shouldFail: boolean = false,
  ) {}

  async verify(_token: string): Promise<TokenPayload> {
    if (this.shouldFail) {
      throw AppError.from(new Error('Invalid token'), 401).withCode(
        'UNAUTHORIZED',
      );
    }
    return this.payload;
  }
}

class MockAccessStateRPC implements IAccessStateRPC {
  constructor(
    public state: AccountAccessState = {
      accountId: 'user-123',
      status: 'ACTIVE',
      role: 'FARMER',
      accessAllowed: true,
    },
    public shouldTimeout: boolean = false,
  ) {}

  async check(accountId: string): Promise<AccountAccessState> {
    if (this.shouldTimeout) {
      throw AppError.from(
        new Error('Access-state RPC timed out'),
        503,
      ).withCode('ACCESS_STATE_UNAVAILABLE');
    }
    return { ...this.state, accountId };
  }
}

describe('Phase 9 — Auth Middleware & Access-State Integration', () => {
  it('returns 401 if authorization header is missing', async () => {
    const introspector = new MockIntrospector();
    const middleware = authMiddleware(introspector);

    let statusCode = 0;
    let jsonBody: any = null;
    let nextCalled = false;

    const req = { headers: {} } as Request;
    const res = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (data: any) => {
        jsonBody = data;
        return res;
      },
      locals: {},
    } as unknown as Response;

    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(statusCode, 401);
    assert.deepStrictEqual(jsonBody, { error: 'Unauthorized' });
    assert.strictEqual(nextCalled, false);
  });

  it('returns 401 if introspector returns isOk: false', async () => {
    const introspector = new MockIntrospector({
      payload: null,
      error: new Error('Token expired'),
      isOk: false,
    });
    const middleware = authMiddleware(introspector);

    let statusCode = 0;
    let jsonBody: any = null;
    let nextCalled = false;

    const req = {
      headers: { authorization: 'Bearer invalid-token' },
    } as unknown as Request;
    const res = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (data: any) => {
        jsonBody = data;
        return res;
      },
      locals: {},
    } as unknown as Response;

    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(statusCode, 401);
    assert.deepStrictEqual(jsonBody, { error: 'Token expired' });
    assert.strictEqual(nextCalled, false);
  });

  it('sets requester in res.locals and calls next() on successful introspect', async () => {
    const introspector = new MockIntrospector({
      payload: { sub: 'farmer-uuid', role: UserRole.FARMER },
      isOk: true,
    });
    const middleware = authMiddleware(introspector);

    let nextCalled = false;
    const req = {
      headers: { authorization: 'Bearer valid-jwt-token' },
    } as unknown as Request;
    const res = {
      locals: {},
    } as unknown as Response;

    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true);
    assert.deepStrictEqual(res.locals.requester, {
      sub: 'farmer-uuid',
      role: UserRole.FARMER,
    });
  });

  it('verifies token with ITokenVerifier and passes when access-state is ACTIVE', async () => {
    const verifier = new MockTokenVerifier({
      sub: 'farmer-uuid',
      role: UserRole.FARMER,
    });
    const accessRpc = new MockAccessStateRPC({
      accountId: 'farmer-uuid',
      status: 'ACTIVE',
      role: 'FARMER',
      accessAllowed: true,
    });

    const middleware = authMiddleware(verifier, accessRpc);

    let nextCalled = false;
    let errPassed: any = null;

    const req = {
      headers: { authorization: 'Bearer valid-rs256-jwt' },
    } as unknown as Request;
    const res = {
      locals: {},
    } as unknown as Response;

    await middleware(req, res, (err) => {
      nextCalled = true;
      errPassed = err;
    });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(errPassed, undefined);
    assert.deepStrictEqual(res.locals.requester, {
      sub: 'farmer-uuid',
      role: UserRole.FARMER,
    });
  });

  it('blocks LOCKED account with 403 ACCOUNT_NOT_ACTIVE', async () => {
    const verifier = new MockTokenVerifier({
      sub: 'locked-user-uuid',
      role: UserRole.FARMER,
    });
    const accessRpc = new MockAccessStateRPC({
      accountId: 'locked-user-uuid',
      status: 'LOCKED',
      role: 'FARMER',
      accessAllowed: false,
    });

    const middleware = authMiddleware(verifier, accessRpc);

    let errPassed: any = null;
    const req = {
      headers: { authorization: 'Bearer valid-jwt-locked' },
    } as unknown as Request;
    const res = {
      locals: {},
    } as unknown as Response;

    await middleware(req, res, (err) => {
      errPassed = err;
    });

    assert.ok(errPassed instanceof AppError);
    assert.strictEqual(errPassed.getStatusCode(), 403);
    assert.strictEqual(errPassed.getCode(), 'ACCOUNT_NOT_ACTIVE');
  });

  it('blocks INACTIVE or UNVERIFIED account with 403 ACCOUNT_NOT_ACTIVE', async () => {
    const verifier = new MockTokenVerifier({
      sub: 'unverified-user-uuid',
      role: UserRole.TRADER,
    });
    const accessRpc = new MockAccessStateRPC({
      accountId: 'unverified-user-uuid',
      status: 'UNVERIFIED',
      role: 'TRADER',
      accessAllowed: false,
    });

    const middleware = authMiddleware(verifier, accessRpc);

    let errPassed: any = null;
    const req = {
      headers: { authorization: 'Bearer valid-jwt-unverified' },
    } as unknown as Request;
    const res = {
      locals: {},
    } as unknown as Response;

    await middleware(req, res, (err) => {
      errPassed = err;
    });

    assert.ok(errPassed instanceof AppError);
    assert.strictEqual(errPassed.getStatusCode(), 403);
    assert.strictEqual(errPassed.getCode(), 'ACCOUNT_NOT_ACTIVE');
  });

  it('fails closed with 503 ACCESS_STATE_UNAVAILABLE on RPC timeout', async () => {
    const verifier = new MockTokenVerifier({
      sub: 'farmer-uuid',
      role: UserRole.FARMER,
    });
    const accessRpc = new MockAccessStateRPC(undefined, true); // will timeout

    const middleware = authMiddleware(verifier, accessRpc);

    let errPassed: any = null;
    const req = {
      headers: { authorization: 'Bearer valid-jwt' },
    } as unknown as Request;
    const res = {
      locals: {},
    } as unknown as Response;

    await middleware(req, res, (err) => {
      errPassed = err;
    });

    assert.ok(errPassed instanceof AppError);
    assert.strictEqual(errPassed.getStatusCode(), 503);
    assert.strictEqual(errPassed.getCode(), 'ACCESS_STATE_UNAVAILABLE');
  });

  it('allowRoles middleware grants permitted role and blocks unpermitted role with 403', async () => {
    const traderOnly = allowRoles([UserRole.TRADER]);

    // Permitted TRADER
    let passed = false;
    const reqTrader = {} as Request;
    const resTrader = {
      locals: { requester: { sub: 'trader-1', role: UserRole.TRADER } },
    } as unknown as Response;

    await traderOnly(reqTrader, resTrader, (err) => {
      if (!err) passed = true;
    });
    assert.strictEqual(passed, true);

    // Blocked FARMER attempting TRADER endpoint
    let errFarmer: any = null;
    const reqFarmer = {} as Request;
    const resFarmer = {
      locals: { requester: { sub: 'farmer-1', role: UserRole.FARMER } },
    } as unknown as Response;

    await traderOnly(reqFarmer, resFarmer, (err) => {
      errFarmer = err;
    });
    assert.ok(errFarmer instanceof AppError);
    assert.strictEqual(errFarmer.getStatusCode(), 403);
    assert.strictEqual(errFarmer.getCode(), 'FORBIDDEN');
  });

  it('real RS256 cryptographic verification works via JWTVerifier', async () => {
    // Generate RSA key pair dynamically in test
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const issuer = 'urn:soa:user-service';
    const audience = 'soa-api';
    const accountId = '88888888-8888-8888-8888-888888888888';

    // Sign real RS256 token
    const token = jwt.sign(
      { sub: accountId, role: UserRole.FARMER },
      privateKey,
      {
        algorithm: 'RS256',
        issuer,
        audience,
        expiresIn: '15m',
      },
    );

    const verifier = new JWTVerifier(publicKey, issuer, audience);
    const decoded = await verifier.verify(token);

    assert.strictEqual(decoded.sub, accountId);
    assert.strictEqual(decoded.role, UserRole.FARMER);

    // Verify expired / invalid token throws 401
    await assert.rejects(
      async () => {
        await verifier.verify('invalid.token.signature');
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.getStatusCode(), 401);
        assert.strictEqual(err.getCode(), 'UNAUTHORIZED');
        return true;
      },
    );
  });
});
