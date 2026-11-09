# TRADING SERVICE — IMPLEMENTATION PLAN

> **Based on**: `BA - SOA.md` (Contract v2.1) and `sample/` reference implementation  
> **Status**: Planning only — no application code modified

---

## 1. Trading Service Responsibilities & Requirements (from BA-SOA.md)

### 1.1 Ownership (Contract v2.1 §2)
- **Owns**: `Listing`, `Offer`, exclusive-lock one transaction per Listing, two User replicas (`farmer_replicas`, `trader_replicas`)
- **Must NOT**: Write to `payment_db` or `user_db`, calculate reputation scores, accept `listingId` / `farmerId` from client as source of truth

### 1.2 Core Business Entities

| Entity | Description |
|--------|-------------|
| `Listing` | A Farmer's crop listing for sale, created from a Farming snapshot |
| `Offer` | A Trader's offer to purchase a Listing; `depositAmount` starts at 0 |
| `FarmerReplica` | Cached public profile of farmers, synced via Kafka |
| `TraderReplica` | Cached public profile of traders, synced via Kafka |

### 1.3 State Machines

```
Listing:  OPEN ──(deposit-commit)──> LOCKED ──(Contract COMPLETED)──> SOLD
          WARNING: LOCKED -> OPEN is forbidden

Offer:    PENDING ──> ACCEPTED
```

### 1.4 Key Business Rules

| ID | Rule |
|----|------|
| BR-TS-001 | farmerId comes from JWT sub, never from client request body |
| BR-TS-002 | Listing is created from a Farming snapshot (requires cropSeasonId) |
| BR-TS-003 | Snapshot missing cropType, GPS, or expectedYield → 409 SNAPSHOT_INCOMPLETE |
| BR-TS-004 | Farmer can accept multiple Offers on the same Listing |
| BR-TS-005 | Only ONE transaction can win per Listing (exclusive lock via deposit-commit) |
| BR-TS-006 | deposit-commit call must be idempotent (Idempotency-Key = paymentTrackingId) |
| BR-TS-007 | Listing LOCKED only after deposit-commit succeeds and is durably committed |
| BR-TS-008 | Listing SOLD only when winning Contract reaches COMPLETED via Kafka event |
| BR-TS-009 | Late/old-version Kafka events must NOT rollback state |
| BR-TS-010 | depositAmount on Offer updated only from confirmed DEPOSIT_PAID event |
| BR-TS-011 | Trading derives listingId from offerId — not from contractId passed by Payment |

### 1.5 Environment Variables (§19)

```
SERVER_PORT=8083
DATABASE_URL=postgresql://...
KAFKA_BOOTSTRAP_SERVERS=...
USER_SERVICE_URL=http://user-service:8081
FARMING_SERVICE_URL=http://farming-service:8082
JWT_PUBLIC_KEY_PATH=...
JWT_ISSUER=urn:soa:user-service
JWT_AUDIENCE=soa-api
ACCESS_STATE_TIMEOUT_MS=1000
X_SERVICE_KEY_PAYMENT=<secret>
X_SERVICE_KEY_TRADING_TO_FARMING=<secret>
```

---

## 2. Sample Architecture Analysis

### 2.1 Technology Stack (actual)

| Concern | Sample uses | Trading Service will use |
|---------|-------------|--------------------------|
| Runtime | Node.js + TypeScript | Node.js + TypeScript |
| HTTP | Express 5 | Express 5 |
| Database | MySQL + Sequelize | PostgreSQL + Prisma (mandated) |
| Validation | Zod | Zod |
| Auth | JWT HMAC (HS256) | JWT RS256 (public key only) |
| HTTP client | axios | axios |
| UUID | uuid v7 | uuid v7 |

### 2.2 Architecture Pattern (Hexagonal / Ports and Adapters)

```
INFRASTRUCTURE (infras/)
  infras/transport  <-->  APPLICATION (usecase/)  <-->  DOMAIN (model/ + interface/)
  infras/repository
```

### 2.3 Key Conventions from sample/

| Convention | Location |
|-----------|----------|
| Factory function setupXxxHexagon(db, sctx) wires deps + returns Router | modules/user/index.ts |
| Port interface in modules/xxx/interface/index.ts extending IUseCase | interface/index.ts |
| Domain model + Zod schema in modules/xxx/model/index.ts | model/index.ts |
| UseCase class implements port, constructor-injected IRepository | usecase/index.ts |
| HTTP handler extends BaseHttpService for CRUD | infras/transport/index.ts |
| Persistence DTO registers model in infras/repository/{db}/dto.ts | infras/repository/mysql/dto.ts |
| No TypeScript decorator-based DI — plain constructor injection | All files |
| ServiceContext passed into each hexagon setup function | share/interface/service-context.ts |

### 2.4 Error-Handling Approach (actual implementation)

```
1. Domain sentinel errors: plain Error objects (e.g. ErrListingNotFound = new Error(...))
2. Use case wraps: throw AppError.from(ErrListingNotFound, 404).withLog('context')
3. Transport: errors propagate to Express error handler
4. responseErr(err, res) handles AppError -> statusCode+toJSON, ZodError -> 400, Unknown -> 500
```

No TypeScript @Decorator syntax used. Pattern is factory-method + fluent wrapper:
`AppError.from(err, status).wrap(cause).withDetail(key, val).withLog(msg)`

---

## 3. Proposed Folder Structure

```
src/
├── index.ts                          # Entry: wire all hexagons, start server
├── share/
│   ├── app-error.ts                  # ADAPT from sample (add BA-SOA error codes + envelope)
│   ├── util.ts                       # COPY verbatim
│   ├── interface/
│   │   ├── index.ts                  # ADAPT: update UserRole to FARMER/TRADER/ADMIN
│   │   └── service-context.ts        # COPY verbatim
│   ├── model/
│   │   ├── base-error.ts             # COPY verbatim
│   │   ├── base-model.ts             # ADAPT: add trading-specific statuses
│   │   └── paging.ts                 # ADAPT: page=0-based; response {items,page,size,totalElements,totalPages}
│   ├── middleware/
│   │   ├── index.ts                  # COPY verbatim
│   │   ├── auth.ts                   # ADAPT: RS256 public-key verify + access-state check
│   │   ├── check-role.ts             # ADAPT: roles = FARMER/TRADER/ADMIN
│   │   └── service-key.ts            # NEW: validate X-Service-Key header for internal APIs
│   ├── component/
│   │   ├── config.ts                 # ADAPT: postgres, kafka, jwt-public-key, service urls
│   │   ├── jwt.ts                    # ADAPT: RS256 public-key verify only (no sign)
│   │   └── prisma.ts                 # NEW: PrismaClient singleton (replaces sequelize.ts)
│   ├── repository/
│   │   ├── repo-prisma.ts            # NEW: BaseRepository for Prisma (replaces repo-sequelize.ts)
│   │   └── access-state.rpc.ts       # NEW: calls User /internal/v1/accounts/{id}/access-state
│   └── transport/
│       └── http-server.ts            # ADAPT: keep BaseHttpService, fix response envelope
│
└── modules/
    ├── listing/
    │   ├── index.ts                  # setupListingHexagon(prisma, kafka, sctx)
    │   ├── model/
    │   │   ├── index.ts              # Listing domain type, Zod schemas, DTOs
    │   │   └── error.ts              # ErrListingNotFound, ErrSnapshotIncomplete, etc.
    │   ├── interface/
    │   │   └── index.ts              # IListingUseCase, IListingRepository, IFarmingRpc
    │   ├── usecase/
    │   │   └── index.ts              # ListingUseCase: create, list, getDetail, depositCommit
    │   └── infras/
    │       ├── repository/prisma/
    │       │   ├── dto.ts            # Prisma model mapping
    │       │   └── index.ts          # PrismaListingRepository
    │       ├── rpc/
    │       │   └── farming.rpc.ts    # FarmingRpcClient: GET /api/v1/plots/{plotId}/summary
    │       └── transport/
    │           └── index.ts          # ListingHTTPService
    │
    ├── offer/
    │   ├── index.ts                  # setupOfferHexagon(prisma, kafka, sctx)
    │   ├── model/
    │   │   ├── index.ts              # Offer domain type, Zod schemas, DTOs
    │   │   └── error.ts              # ErrOfferNotFound, ErrOfferNotAccepted, etc.
    │   ├── interface/
    │   │   └── index.ts              # IOfferUseCase, IOfferRepository
    │   ├── usecase/
    │   │   └── index.ts              # OfferUseCase: create, accept, depositCommit
    │   └── infras/
    │       ├── repository/prisma/
    │       │   ├── dto.ts
    │       │   └── index.ts          # PrismaOfferRepository (with tx support)
    │       └── transport/
    │           └── index.ts          # OfferHTTPService (public + internal routes)
    │
    ├── user-replica/
    │   ├── index.ts                  # setupUserReplicaHexagon(prisma, kafka)
    │   ├── model/index.ts            # FarmerReplica, TraderReplica types
    │   ├── interface/index.ts        # IUserReplicaRepository
    │   ├── usecase/index.ts          # upsert on profile event
    │   └── infras/
    │       ├── repository/prisma/index.ts
    │       └── kafka/consumer.ts     # USER_PROFILE_UPDATED consumer
    │
    └── event/
        ├── index.ts                  # setupKafkaHexagon(kafka, useCases)
        ├── producer/
        │   ├── offer-events.ts       # publish OFFER_CREATED, OFFER_ACCEPTED
        │   └── outbox-relay.ts       # Transactional outbox relay
        └── consumer/
            ├── deposit-paid.ts       # DEPOSIT_PAID -> update depositAmount
            ├── contract-status.ts    # CONTRACT_STATUS_CHANGED -> SOLD
            └── user-profile.ts       # USER_PROFILE_UPDATED -> replica upsert
```

---

## 4. Share/ File Mapping

| File | Action | Reason |
|------|--------|--------|
| share/app-error.ts | COPY + ADAPT | Add BA-SOA error codes; align toJSON to {timestamp, status, code, message, path, traceId?} |
| share/util.ts | COPY verbatim | Generic utility |
| share/interface/index.ts | ADAPT | UserRole: FARMER/TRADER/ADMIN |
| share/interface/service-context.ts | COPY verbatim | Compatible shape |
| share/model/base-error.ts | COPY verbatim | ErrDataNotFound reused |
| share/model/base-model.ts | ADAPT | Replace generic ModelStatus with domain enums |
| share/model/paging.ts | ADAPT | page=0-based; max 100; new response envelope shape |
| share/middleware/index.ts | COPY verbatim | Interface unchanged |
| share/middleware/auth.ts | ADAPT | RS256 public-key JWT + access-state RPC |
| share/middleware/check-role.ts | ADAPT | FARMER/TRADER/ADMIN enum |
| share/middleware/service-key.ts | NEW | X-Service-Key validation for /internal/** |
| share/component/config.ts | ADAPT | PostgreSQL, Kafka, JWT public key, service URLs |
| share/component/jwt.ts | ADAPT | RS256 verify-only (no sign) |
| share/component/sequelize.ts | REPLACE with prisma.ts | Mandated PostgreSQL + Prisma |
| share/repository/repo-sequelize.ts | REPLACE with repo-prisma.ts | Prisma base repository |
| share/repository/verify-token.rpc.ts | REPLACE with access-state.rpc.ts | Trading calls access-state, not introspect |
| share/transport/http-server.ts | ADAPT | Adjust listAPI for page=0, fix response shape |

---

## 5. Domain Models, Ports, Use Cases, and Adapters

### 5.1 Domain Models

**Listing** (modules/listing/model/index.ts):
```typescript
enum ListingStatus { OPEN = 'OPEN', LOCKED = 'LOCKED', SOLD = 'SOLD' }

const ListingSchema = z.object({
  listingId:                z.string().uuid(),
  farmerId:                 z.string().uuid(),
  plotId:                   z.string().uuid(),
  cropSeasonId:             z.string().uuid(),       // logical ref only
  seedType:                 z.string().min(1),
  estimatedYield:           z.number().positive(),   // kg
  area:                     z.number().positive(),   // m²
  latitude:                 z.number().min(-90).max(90),
  longitude:                z.number().min(-180).max(180),
  expectedPrice:            z.string().regex(/^\d+(\.\d{2})?$/), // decimal string VND
  status:                   z.nativeEnum(ListingStatus),
  winningContractId:        z.string().uuid().nullable(),
  winningPaymentTrackingId: z.string().uuid().nullable(),
  createdAt:                z.date(),
  updatedAt:                z.date(),
});
```

**Offer** (modules/offer/model/index.ts):
```typescript
enum OfferStatus { PENDING = 'PENDING', ACCEPTED = 'ACCEPTED' }

const OfferSchema = z.object({
  offerId:       z.string().uuid(),
  listingId:     z.string().uuid(),
  farmerId:      z.string().uuid(),
  traderId:      z.string().uuid(),
  depositAmount: z.string().regex(/^\d+(\.\d{2})?$/), // starts "0.00"
  status:        z.nativeEnum(OfferStatus),
  createdAt:     z.date(),
  updatedAt:     z.date(),
});
```

**UserReplica** (modules/user-replica/model/index.ts):
```typescript
const UserReplicaSchema = z.object({
  accountId:      z.string().uuid(),
  role:           z.enum(['FARMER', 'TRADER']),
  displayName:    z.string(),
  avatarUrl:      z.string().nullable(),
  province:       z.string().nullable(),
  district:       z.string().nullable(),
  joinedAt:       z.date(),
  profileVersion: z.number().int(),
  publicVisible:  z.boolean(),
  updatedAt:      z.date(),
});
```

### 5.2 Port Interfaces

```typescript
// IListingRepository
interface IListingRepository {
  insert(listing: Listing): Promise<void>;
  getById(listingId: string): Promise<Listing | null>;
  list(cond: ListingCondDTO, paging: PagingDTO): Promise<{ items: Listing[], total: number }>;
  // Atomic exclusive lock; returns null if another key already committed
  tryCommitDeposit(offerId: string, contractId: string, paymentTrackingId: string, depositAmount: string): Promise<DepositCommitResult | null>;
  getCommitResult(offerId: string): Promise<DepositCommitResult | null>;
  setSold(listingId: string, winningContractId: string): Promise<void>;
}

// IFarmingRpc
interface IFarmingRpc {
  getPlotSummary(plotId: string, cropSeasonId: string): Promise<FarmingSnapshotDTO>;
}

// IOfferRepository
interface IOfferRepository {
  insert(offer: Offer): Promise<void>;
  getById(offerId: string): Promise<Offer | null>;
  accept(offerId: string): Promise<void>;
  updateDepositAmount(offerId: string, depositAmount: string): Promise<void>;
}
```

---

## 6. PostgreSQL + Prisma Schema

```prisma
model Listing {
  listingId                String        @id @default(uuid()) @map("listing_id") @db.Uuid
  farmerId                 String        @map("farmer_id") @db.Uuid
  plotId                   String        @map("plot_id") @db.Uuid
  cropSeasonId             String        @map("crop_season_id") @db.Uuid
  seedType                 String        @map("seed_type")
  estimatedYield           Decimal       @map("estimated_yield") @db.Decimal(12, 2)
  area                     Decimal       @db.Decimal(12, 2)
  latitude                 Decimal       @db.Decimal(9, 6)
  longitude                Decimal       @db.Decimal(9, 6)
  expectedPrice            Decimal       @map("expected_price") @db.Decimal(18, 2)
  status                   ListingStatus @default(OPEN)
  winningContractId        String?       @map("winning_contract_id") @db.Uuid
  winningPaymentTrackingId String?       @map("winning_payment_tracking_id") @db.Uuid
  createdAt                DateTime      @default(now()) @map("created_at") @db.Timestamptz
  updatedAt                DateTime      @updatedAt @map("updated_at") @db.Timestamptz
  offers                   Offer[]
  @@map("listings")
}

model Offer {
  offerId       String      @id @default(uuid()) @map("offer_id") @db.Uuid
  listingId     String      @map("listing_id") @db.Uuid
  farmerId      String      @map("farmer_id") @db.Uuid
  traderId      String      @map("trader_id") @db.Uuid
  depositAmount Decimal     @default(0) @map("deposit_amount") @db.Decimal(18, 2)
  status        OfferStatus @default(PENDING)
  createdAt     DateTime    @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime    @updatedAt @map("updated_at") @db.Timestamptz
  listing       Listing     @relation(fields: [listingId], references: [listingId])
  @@map("offers")
}

model FarmerReplica {
  accountId      String   @id @map("account_id") @db.Uuid
  displayName    String   @map("display_name")
  avatarUrl      String?  @map("avatar_url")
  province       String?
  district       String?
  joinedAt       DateTime @map("joined_at") @db.Timestamptz
  profileVersion BigInt   @default(0) @map("profile_version")
  publicVisible  Boolean  @default(true) @map("public_visible")
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz
  @@map("farmer_replicas")
}

model TraderReplica {
  accountId      String   @id @map("account_id") @db.Uuid
  displayName    String   @map("display_name")
  avatarUrl      String?  @map("avatar_url")
  province       String?
  district       String?
  joinedAt       DateTime @map("joined_at") @db.Timestamptz
  profileVersion BigInt   @default(0) @map("profile_version")
  publicVisible  Boolean  @default(true) @map("public_visible")
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz
  @@map("trader_replicas")
}

// Transactional outbox (BA-SOA §10 requirement)
model OutboxEvent {
  eventId      String    @id @map("event_id") @db.Uuid
  eventType    String    @map("event_type")
  topic        String
  partitionKey String    @map("partition_key")
  payload      Json
  publishedAt  DateTime? @map("published_at") @db.Timestamptz
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz
  @@index([publishedAt])
  @@map("outbox_events")
}

enum ListingStatus { OPEN; LOCKED; SOLD }
enum OfferStatus   { PENDING; ACCEPTED }
```

### 6.1 Concurrency for deposit-commit (SELECT FOR UPDATE)

```typescript
// PrismaListingRepository.tryCommitDeposit()
async tryCommitDeposit(offerId, contractId, paymentTrackingId, depositAmount) {
  return prisma.$transaction(async (tx) => {
    // 1. Lock Listing row for the Offer's listingId
    const rows = await tx.$queryRaw`
      SELECT l.* FROM listings l
      JOIN offers o ON o.listing_id = l.listing_id
      WHERE o.offer_id = ${offerId}::uuid
      FOR UPDATE
    `;
    const listing = rows[0];
    if (!listing) throw AppError.from(ErrListingNotFound, 404);

    // 2. Idempotency: same tracking key already committed?
    if (listing.winning_payment_tracking_id === paymentTrackingId) {
      return buildCommitResult(listing); // idempotent return
    }

    // 3. Already won by a DIFFERENT key?
    if (listing.winning_contract_id !== null) {
      return null; // caller throws 409 LISTING_ALREADY_COMMITTED
    }

    // 4. Atomically set winner + LOCKED status
    await tx.$executeRaw`
      UPDATE listings SET
        status = 'LOCKED',
        winning_contract_id = ${contractId}::uuid,
        winning_payment_tracking_id = ${paymentTrackingId}::uuid,
        updated_at = NOW()
      WHERE listing_id = ${listing.listing_id}::uuid
    `;

    return buildCommitResult({ ...listing, status: 'LOCKED' });
  });
}
```

### 6.2 Transactional Outbox

Every `OFFER_CREATED` and `OFFER_ACCEPTED` event:
1. Within the same Prisma `$transaction` as the business write, insert a row into `outbox_events`
2. Background relay process (polling ~500ms) reads unpublished rows → publishes to Kafka → marks `published_at`
3. On Kafka failure → retry; event stays in outbox (eventId stable across retries)

---

## 7. API Endpoints

### 7.1 Public Endpoints

| Method | Path | Auth | Role | Action |
|--------|------|------|------|--------|
| POST | /api/v1/listings | Bearer JWT | FARMER | Create Listing from Farming snapshot |
| GET | /api/v1/listings | Bearer JWT | ANY | List Listings (GPS-sorted feed) |
| GET | /api/v1/listings/:listingId | Bearer JWT | ANY | Get Listing detail |
| POST | /api/v1/offers | Bearer JWT | TRADER | Create Offer |
| GET | /api/v1/offers/:offerId | Bearer JWT | Participant | Get Offer detail |
| POST | /api/v1/offers/:offerId/accept | Bearer JWT | FARMER (owner) | Accept Offer |

### 7.2 Internal Endpoints (X-Service-Key, not routed through Gateway)

| Method | Path | Caller | Action |
|--------|------|--------|--------|
| POST | /internal/v1/offers/:offerId/deposit-commit | Payment | Lock Listing; idempotent via Idempotency-Key header |
| GET | /internal/v1/offers/:offerId/deposit-commit | Payment | Recovery: read existing commit result |

### 7.3 Kafka Events

**Producer** (Trading → Kafka):

| Event | Topic | Key | Recipients |
|-------|-------|-----|-----------|
| OFFER_CREATED | soa.trading.offer.v1 | offerId | [farmerId] |
| OFFER_ACCEPTED | soa.trading.offer.v1 | offerId | [traderId] |

**Consumer** (Kafka → Trading):

| Event | Topic | Group | Action |
|-------|-------|-------|--------|
| DEPOSIT_PAID | soa.payment.deposit.v1 | trading-deposit-v1 | Update Offer.depositAmount |
| CONTRACT_STATUS_CHANGED | soa.contract.lifecycle.v1 | trading-contract-v1 | status=COMPLETED + winningContractId match → SOLD |
| USER_PROFILE_UPDATED | soa.user.profile.v1 | trading-user-profile-v1 | Upsert replica; publicVisible=false → hide |

Kafka Envelope (required by BA-SOA §8):
```json
{
  "eventId": "uuid-v7",
  "eventType": "OFFER_CREATED",
  "eventVersion": 1,
  "sourceService": "trading-service",
  "occurredAt": "2026-10-28T05:00:00Z",
  "actorId": "traderId",
  "recipientIds": ["farmerId"],
  "referenceType": "OFFER",
  "referenceId": "offerId",
  "correlationId": null,
  "data": { "offerId": "...", "listingId": "...", "farmerId": "...", "traderId": "..." }
}
```

---

## 8. Error-Handling Approach

### 8.1 Sentinel Errors per Module

```typescript
// modules/listing/model/error.ts
export const ErrListingNotFound         = new Error('Listing not found');
export const ErrSnapshotIncomplete      = new Error('Crop snapshot is incomplete');
export const ErrListingAlreadyCommitted = new Error('Another trader has already committed');
export const ErrInvalidStateTransition  = new Error('Invalid listing state transition');
export const ErrFarmingDependency       = new Error('Farming service unavailable');

// modules/offer/model/error.ts
export const ErrOfferNotFound    = new Error('Offer not found');
export const ErrOfferNotAccepted = new Error('Offer is not in ACCEPTED status');
export const ErrNotParticipant   = new Error('You are not a participant of this offer');
```

### 8.2 Use Case Error Wrapping

```typescript
// 400 validation: throw ZodError directly (responseErr handles it)
const dto = CreateListingDTOSchema.parse(body);

// Business errors: wrap with status
throw AppError.from(ErrSnapshotIncomplete, 409)
  .withDetail('code', 'SNAPSHOT_INCOMPLETE')
  .withLog('Missing: cropType');

// Dependency errors
throw AppError.from(ErrFarmingDependency, 503)
  .withDetail('code', 'DEPENDENCY_UNAVAILABLE');
```

### 8.3 BA-SOA Error Envelope Adaptation

The sample's `toJSON()` produces `{message, statusCode, details}`.
Trading adapts it to match BA-SOA §3:
```json
{
  "timestamp": "2026-10-28T05:00:00Z",
  "status": 409,
  "code": "LISTING_ALREADY_COMMITTED",
  "message": "Another trader has already committed",
  "path": "/internal/v1/offers/xxx/deposit-commit"
}
```
This requires adding a `code` field to `AppError` and updating `responseErr` to inject `req.path` and `timestamp`.

---

## 9. Ordered Implementation Checklist

### Phase 1 — Project Bootstrap
- [x] 1.1 Init package.json (Express 5, Prisma, zod, axios, kafkajs, uuid, jsonwebtoken, morgan, dotenv)
- [x] 1.2 Configure tsconfig.json with path aliases @share/*, @modules/*
- [x] 1.3 Create .env.example with all variable names (no secrets)
- [x] 1.4 Copy/adapt share/ files per mapping table in §4

Verify: `npx tsc --noEmit` passes

### Phase 2 — Database Schema
- [x] 2.1 `npx prisma init`
- [x] 2.2 Write prisma/schema.prisma (all models + enums from §6)
- [ ] 2.3 `npx prisma migrate dev --name init`
- [x] 2.4 `npx prisma generate`
- [x] 2.5 Create share/component/prisma.ts singleton

Verify: `npx prisma studio` shows all tables

### Phase 3 — UserReplica Module
- [ ] 3.1 Domain model + Zod schema
- [ ] 3.2 IUserReplicaRepository port
- [ ] 3.3 UserReplicaUseCase (upsert with profileVersion check)
- [ ] 3.4 PrismaUserReplicaRepository
- [ ] 3.5 Kafka consumer stub for USER_PROFILE_UPDATED

Verify: upsert with old profileVersion does not regress data

### Phase 4 — Listing Module
- [x] 4.1 Domain model, schemas, sentinel errors
- [x] 4.2 IListingRepository, IListingUseCase, IFarmingRpc ports
- [x] 4.3 FarmingRpcClient (axios, service key, 1s timeout)
- [x] 4.4 ListingUseCase.createListing (snapshot validation + DB insert)
- [x] 4.5 PrismaListingRepository (insert, getById, list, count)
- [x] 4.6 ListingHTTPService (POST, GET list, GET detail)
- [x] 4.7 Wire setupListingHexagon in index.ts

Verify: POST creates Listing; Farming unreachable → 503

### Phase 5 — Offer Module
- [x] 5.1 Domain model, schemas, sentinel errors
- [x] 5.2 IOfferRepository, IOfferUseCase ports
- [x] 5.3 OfferUseCase.createOffer + acceptOffer
- [x] 5.4 PrismaOfferRepository
- [x] 5.5 OfferHTTPService (POST offer, POST accept, GET offer)
- [x] 5.6 Wire setupOfferHexagon in index.ts

Verify: Trader creates Offer; Farmer accepts; status transitions correct

### Phase 6 — Transactional Outbox + Kafka Producer
- [x] 6.1 insertOutboxEvent(tx, envelope) helper
- [x] 6.2 Integrate into createOffer + acceptOffer (same Prisma transaction)
- [x] 6.3 Kafka producer (kafkajs) in share/component/kafka.ts
- [x] 6.4 Outbox relay: poll unpublished rows → publish → mark published

Verify: Offer created → outbox row → relay publishes to Kafka

### Phase 7 — Internal deposit-commit API
- [x] 7.1 share/middleware/service-key.ts (validate X-Service-Key)
- [x] 7.2 PrismaListingRepository.tryCommitDeposit (SELECT FOR UPDATE)
- [x] 7.3 PrismaListingRepository.getCommitResult
- [x] 7.4 ListingUseCase.depositCommit (idempotency logic)
- [x] 7.5 OfferHTTPService internal routes (POST + GET deposit-commit)

Verify: Two simultaneous calls → only one wins (409 for second); same key → idempotent result

### Phase 8 — Kafka Consumers
- [ ] 8.1 DEPOSIT_PAID consumer → update offers.deposit_amount
- [ ] 8.2 CONTRACT_STATUS_CHANGED consumer → SOLD if winningContractId matches
- [ ] 8.3 USER_PROFILE_UPDATED consumer → replica upsert (Phase 3)

Verify: DEPOSIT_PAID updates amount; COMPLETED → SOLD; late event → no state change

### Phase 9 — Auth Middleware Integration
- [ ] 9.1 auth.ts: RS256 public-key JWT verify
- [ ] 9.2 After verify: call AccessStateRpcClient.check(sub), 1s timeout
- [ ] 9.3 LOCKED/INACTIVE/UNVERIFIED → 403; timeout → 503
- [ ] 9.4 Ownership checks (farmerId from sub, not body)
- [ ] 9.5 Integrate setupMiddlewares into all module routers

Verify: Locked account blocked; wrong role rejected; expired token rejected

### Phase 10 — Docker and Integration
- [ ] 10.1 Dockerfile
- [ ] 10.2 Add to docker-compose.yml (port 8083, trading-db postgres, env vars)
- [ ] 10.3 End-to-end smoke test: Listing → Offer → Accept → deposit-commit → LOCKED → COMPLETED → SOLD
- [ ] 10.4 Confirm /internal/** not exposed through Gateway

---

## 10. Unresolved Questions and Blockers

| # | Issue | Impact |
|---|-------|--------|
| Q1 | sample/index.ts references setupBrandHexagon, setupCategoryHexagon, setupProductHexagon but those modules don't exist. Compilation would fail. Confirmed irrelevant to Trading — only user module is the actual reference. | None for Trading |
| Q2 | BA-SOA §1019 says page=0 (0-indexed) but sample PagingDTOSchema uses page starting at 1. Need team confirmation on paging convention. | Medium — affects all list APIs |
| Q3 | BA-SOA §1019 says Listing feed sorts by GPS distance ascending. PostGIS extension required for accurate distance. Need to confirm if PostGIS is available in postgres deployment. Alternative: manual Haversine in SQL. | Medium — affects Listing list |
| Q4 | Exact header name and allowlist mechanism for cross-service keys not fully specified beyond X-Service-Key. Need to confirm with Farming team what header they validate. | Medium — blocks Phase 4 |
| Q5 | Whether Trading needs to call Payment to validate contractId ownership before deposit-commit. BA-SOA says Trading checks Offer is ACCEPTED and correct participant — assumed no Payment callback needed. | Low — current plan correct |
| Q6 | Kafka client library not specified in BA-SOA. Plan uses kafkajs. Need team confirmation. | Low |
| Q7 | When USER_PROFILE_UPDATED has publicVisible=false: plan keeps replica row but sets publicVisible=false (preserves version for out-of-order protection). Alternative is physical delete. | Low — current plan follows BA-SOA intent |
| Q8 | Payment must call /internal/v1/offers/{offerId}/deposit-commit (offerId as path param). If Payment team uses a different path format, Phase 7 breaks. Confirm with Payment team. | High — must align before Phase 7 |
