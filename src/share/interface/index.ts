import { PagingDTO } from "@share/model/paging";

// ─── Roles (BA-SOA §4) ──────────────────────────────────

export enum UserRole {
  FARMER = 'FARMER',
  TRADER = 'TRADER',
  ADMIN  = 'ADMIN',
}

// ─── Token / Auth ────────────────────────────────────────

export interface TokenPayload {
  sub: string;       // account UUID
  role: UserRole;
  iat?: number;
  exp?: number;
  jti?: string;
}

export interface Requester extends TokenPayload {}

export interface ITokenIntrospect {
  introspect(token: string): Promise<TokenIntrospectResult>;
}

export type TokenIntrospectResult = {
  payload: TokenPayload | null;
  error?: Error;
  isOk: boolean;
};

// ─── Generic Repository Interfaces ──────────────────────

export interface IRepository<Entity, Cond, UpdateDTO>
  extends IQueryRepository<Entity, Cond>,
    ICommandRepository<Entity, UpdateDTO> {}

export interface IQueryRepository<Entity, Cond> {
  get(id: string): Promise<Entity | null>;
  findByCond(cond: Cond): Promise<Entity | null>;
  list(cond: Cond, paging: PagingDTO): Promise<Entity[]>;
}

export interface ICommandRepository<Entity, UpdateDTO> {
  insert(data: Entity): Promise<boolean>;
  update(id: string, data: UpdateDTO): Promise<boolean>;
  delete(id: string, isHard: boolean): Promise<boolean>;
}

// ─── CQRS Handlers (from sample/brand) ──────────────────

export interface ICommandHandler<Cmd, Result> {
  execute(command: Cmd): Promise<Result>;
}

export interface IQueryHandler<Query, Result> {
  query(query: Query): Promise<Result>;
}

