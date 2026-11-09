import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import { authMiddleware } from './auth';
import { ITokenIntrospect, TokenIntrospectResult, UserRole } from '../interface';
import { Request, Response } from 'express';

class MockIntrospector implements ITokenIntrospect {
  constructor(
    public result: TokenIntrospectResult = {
      payload: { sub: 'user-123', role: UserRole.FARMER },
      isOk: true,
    }
  ) {}

  async introspect(_token: string): Promise<TokenIntrospectResult> {
    return this.result;
  }
}

describe('authMiddleware (introspect pattern)', () => {
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
    assert.deepStrictEqual(res.locals['requester'], {
      sub: 'farmer-uuid',
      role: UserRole.FARMER,
    });
  });
});

