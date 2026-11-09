import test, { describe, it, before, after } from "node:test";
import assert from "node:assert";
import http from "node:http";
import express, { Express, NextFunction, Request, Response } from "express";
import { v7 as uuidv7 } from "uuid";

import { responseErr } from "@share/app-error";
import {
  AccountAccessState,
  IAccessStateRPC,
  ITokenVerifier,
  TokenPayload,
  UserRole,
} from "@share/interface";
import { ServiceContext } from "@share/interface/service-context";
import { setupMiddlewares } from "@share/middleware";
import { PagingDTO } from "@share/model/paging";
import {
  IEventPublisher,
  IOutboxRepository,
  InsertOutboxDTO,
  OutboxEventRecord,
} from "@share/outbox/interface";
import { OutboxRelay } from "@share/outbox/relay";
import {
  EVENT_CONTRACT_STATUS_CHANGED,
  EVENT_DEPOSIT_PAID,
  EventEnvelope,
  DepositPaidEventData,
  ContractStatusChangedEventData,
} from "@share/event";

import {
  IFarmingRpc,
  IListingRepository,
} from "@modules/listing/interface";
import {
  DepositCommitResult,
  FarmingSnapshotDTO,
  Listing,
  ListingCondDTO,
  ListingStatus,
} from "@modules/listing/model";
import {
  CreateNewListingCmdHandler,
  GetListingDetailQueryHandler,
  ListListingQueryHandler,
} from "@modules/listing/usecase";
import { ListingHTTPService, setupListingRoutes } from "@modules/listing/infras/transport";

import { IOfferRepository } from "@modules/offer/interface";
import { Offer, OfferCondDTO, OfferStatus } from "@modules/offer/model";
import {
  AcceptOfferCmdHandler,
  CreateOfferCmdHandler,
  DepositCommitCmdHandler,
  GetDepositCommitQueryHandler,
  GetOfferDetailQueryHandler,
  ListOfferQueryHandler,
} from "@modules/offer/usecase";
import {
  OfferHTTPService,
  setupInternalOfferRoutes,
  setupOfferRoutes,
} from "@modules/offer/infras/transport";

import { DepositPaidConsumerHandler } from "@modules/event/consumer/deposit-paid";
import { ContractStatusChangedConsumerHandler } from "@modules/event/consumer/contract-status";

// ─── Test Fixtures & Mocks ──────────────────────────────────────

const TEST_PAYMENT_SERVICE_KEY = "dev-payment-service-key";

const farmerId = uuidv7();
const traderId = uuidv7();
const outsiderTraderId = uuidv7();
const plotId = uuidv7();
const cropSeasonId = uuidv7();
const contractId1 = uuidv7();
const trackingId1 = uuidv7();
const competingContractId = uuidv7();
const competingTrackingId = uuidv7();

class InMemoryListingRepository implements IListingRepository {
  public listings: Listing[] = [];
  public offerRepo?: InMemoryOfferRepository;

  async insert(listing: Listing): Promise<void> {
    this.listings.push({ ...listing });
  }

  async getById(listingId: string): Promise<Listing | null> {
    const found = this.listings.find((l) => l.listingId === listingId);
    return found ? { ...found } : null;
  }

  async list(
    cond: ListingCondDTO,
    paging: PagingDTO,
  ): Promise<{ items: Listing[]; total: number }> {
    let filtered = [...this.listings];
    if (cond.farmerId) {
      filtered = filtered.filter((l) => l.farmerId === cond.farmerId);
    }
    if (cond.status) {
      filtered = filtered.filter((l) => l.status === cond.status);
    }
    const page = paging.page ?? 0;
    const size = paging.size ?? 20;
    const start = page * size;
    return {
      items: filtered.slice(start, start + size),
      total: filtered.length,
    };
  }

  async tryCommitDeposit(
    offerId: string,
    contractId: string,
    paymentTrackingId: string,
    _depositAmount: string,
  ): Promise<DepositCommitResult | "already_committed"> {
    let listing: Listing | undefined;
    if (this.offerRepo) {
      const offer = this.offerRepo.offers.find((o) => o.offerId === offerId);
      if (offer) {
        listing = this.listings.find((l) => l.listingId === offer.listingId);
      }
    }
    if (!listing) {
      listing = this.listings[0];
    }
    if (!listing) return "already_committed";

    if (listing.winningPaymentTrackingId === paymentTrackingId) {
      return {
        offerId,
        listingId: listing.listingId,
        contractId: listing.winningContractId ?? contractId,
        paymentTrackingId: listing.winningPaymentTrackingId,
        listingStatus: "LOCKED",
      };
    }

    if (listing.winningContractId !== null) {
      return "already_committed";
    }

    listing.status = ListingStatus.LOCKED;
    listing.winningContractId = contractId;
    listing.winningPaymentTrackingId = paymentTrackingId;
    listing.updatedAt = new Date();

    return {
      offerId,
      listingId: listing.listingId,
      contractId,
      paymentTrackingId,
      listingStatus: "LOCKED",
    };
  }

  async getCommitResult(
    listingId: string,
    offerId?: string,
  ): Promise<DepositCommitResult | null> {
    const listing = this.listings.find((l) => l.listingId === listingId) || this.listings[0];
    if (
      listing &&
      listing.winningContractId &&
      listing.winningPaymentTrackingId
    ) {
      return {
        offerId: offerId ?? "",
        listingId: listing.listingId,
        contractId: listing.winningContractId,
        paymentTrackingId: listing.winningPaymentTrackingId,
        listingStatus: "LOCKED",
      };
    }
    return null;
  }

  async markSold(listingId: string, winningContractId: string): Promise<boolean> {
    const listing = this.listings.find(
      (l) => l.listingId === listingId && l.winningContractId === winningContractId,
    );
    if (!listing) return false;
    listing.status = ListingStatus.SOLD;
    listing.updatedAt = new Date();
    return true;
  }

  async markSoldByContractId(contractId: string): Promise<boolean> {
    const listing = this.listings.find(
      (l) => l.winningContractId === contractId && l.status === ListingStatus.LOCKED,
    );
    if (!listing) return false;
    listing.status = ListingStatus.SOLD;
    listing.updatedAt = new Date();
    return true;
  }

  async getByContractId(contractId: string): Promise<Listing | null> {
    const found = this.listings.find((l) => l.winningContractId === contractId);
    return found ? { ...found } : null;
  }
}

class InMemoryOfferRepository implements IOfferRepository {
  public offers: Offer[] = [];

  async insert(offer: Offer, _tx?: any): Promise<void> {
    this.offers.push({ ...offer });
  }

  async getById(offerId: string): Promise<Offer | null> {
    const found = this.offers.find((o) => o.offerId === offerId);
    return found ? { ...found } : null;
  }

  async updateStatus(
    offerId: string,
    status: OfferStatus,
    _tx?: any,
  ): Promise<boolean> {
    const offer = this.offers.find((o) => o.offerId === offerId);
    if (!offer) return false;
    offer.status = status;
    offer.updatedAt = new Date();
    return true;
  }

  async updateDepositAmount(
    offerId: string,
    depositAmount: string,
    _tx?: any,
  ): Promise<boolean> {
    const offer = this.offers.find((o) => o.offerId === offerId);
    if (!offer) return false;
    offer.depositAmount = depositAmount;
    offer.updatedAt = new Date();
    return true;
  }

  async list(
    cond: OfferCondDTO,
    paging: PagingDTO,
  ): Promise<{ items: Offer[]; total: number }> {
    let filtered = [...this.offers];
    if (cond.listingId) {
      filtered = filtered.filter((o) => o.listingId === cond.listingId);
    }
    if (cond.status) {
      filtered = filtered.filter((o) => o.status === cond.status);
    }
    const page = paging.page ?? 0;
    const size = paging.size ?? 20;
    const start = page * size;
    return {
      items: filtered.slice(start, start + size),
      total: filtered.length,
    };
  }

  async runTransaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
    return work({});
  }
}

class InMemoryOutboxRepository implements IOutboxRepository {
  public events: OutboxEventRecord[] = [];

  async insert(record: InsertOutboxDTO, _tx?: any): Promise<void> {
    this.events.push({
      ...record,
      publishedAt: null,
      createdAt: new Date(),
    });
  }

  async getUnpublished(batchSize: number = 50): Promise<OutboxEventRecord[]> {
    return this.events
      .filter((e) => e.publishedAt === null)
      .slice(0, batchSize);
  }

  async markPublished(eventIds: string[]): Promise<void> {
    const now = new Date();
    for (const id of eventIds) {
      const e = this.events.find((evt) => evt.eventId === id);
      if (e) {
        e.publishedAt = now;
      }
    }
  }
}

class InMemoryEventPublisher implements IEventPublisher {
  public published: Array<{ topic: string; partitionKey: string; payload: any }> = [];

  async publish(topic: string, partitionKey: string, payload: any): Promise<void> {
    this.published.push({ topic, partitionKey, payload });
  }
}

class MockFarmingRpc implements IFarmingRpc {
  async getPlotSummary(pId: string, sId: string): Promise<FarmingSnapshotDTO> {
    return {
      plotId: pId,
      farmerId: farmerId,
      latitude: 10.762622,
      longitude: 106.660172,
      area: 10000,
      currentSeason: {
        cropSeasonId: sId,
        cropType: "Jasmine Rice",
        expectedYield: 5000,
      },
    };
  }
}

// ─── Test Suite ─────────────────────────────────────────────────

describe("Phase 10 — End-to-End Trading Flow & Integration Smoke Test", { concurrency: 1 }, () => {
  let server: http.Server;
  let baseUrl: string;

  let listingRepo: InMemoryListingRepository;
  let offerRepo: InMemoryOfferRepository;
  let outboxRepo: InMemoryOutboxRepository;
  let publisher: InMemoryEventPublisher;
  let outboxRelay: OutboxRelay;
  let farmingRpc: MockFarmingRpc;

  let depositPaidHandler: DepositPaidConsumerHandler;
  let contractStatusHandler: ContractStatusChangedConsumerHandler;

  let createdListingId: string;
  let createdOfferId: string;

  before(async () => {
    // 1. Initialize repositories & components
    listingRepo = new InMemoryListingRepository();
    offerRepo = new InMemoryOfferRepository();
    listingRepo.offerRepo = offerRepo;
    outboxRepo = new InMemoryOutboxRepository();
    publisher = new InMemoryEventPublisher();
    outboxRelay = new OutboxRelay(outboxRepo, publisher);
    farmingRpc = new MockFarmingRpc();

    // 2. Initialize Kafka Consumer Handlers
    depositPaidHandler = new DepositPaidConsumerHandler(offerRepo, listingRepo);
    contractStatusHandler = new ContractStatusChangedConsumerHandler(listingRepo);

    // 3. Setup mock Auth & Access-State
    const tokenVerifier: ITokenVerifier = {
      verify: async (token: string): Promise<TokenPayload> => {
        if (token === "farmer-token") {
          return {
            sub: farmerId,
            role: UserRole.FARMER,
          };
        }
        if (token === "trader-token") {
          return {
            sub: traderId,
            role: UserRole.TRADER,
          };
        }
        if (token === "outsider-trader-token") {
          return {
            sub: outsiderTraderId,
            role: UserRole.TRADER,
          };
        }
        throw new Error("Invalid token");
      },
    };

    const accessStateRpc: IAccessStateRPC = {
      check: async (accountId: string): Promise<AccountAccessState> => ({
        accountId,
        role: "ACTIVE",
        status: "ACTIVE",
        accessAllowed: true,
      }),
    };

    const mdlFactory = setupMiddlewares(tokenVerifier, accessStateRpc);
    const sctx: ServiceContext = { mdlFactory };

    // 4. Setup Hexagonal Handlers & HTTP Services
    const createListingCmdHandler = new CreateNewListingCmdHandler(
      listingRepo,
      farmingRpc,
    );
    const getListingDetailQueryHandler = new GetListingDetailQueryHandler(
      listingRepo,
    );
    const listListingQueryHandler = new ListListingQueryHandler(listingRepo);

    const listingHttpService = new ListingHTTPService(
      createListingCmdHandler,
      getListingDetailQueryHandler,
      listListingQueryHandler,
    );

    const createOfferCmdHandler = new CreateOfferCmdHandler(
      offerRepo,
      listingRepo,
      outboxRepo,
    );
    const acceptOfferCmdHandler = new AcceptOfferCmdHandler(
      offerRepo,
      listingRepo,
      outboxRepo,
    );
    const getOfferDetailQueryHandler = new GetOfferDetailQueryHandler(offerRepo);
    const listOfferQueryHandler = new ListOfferQueryHandler(offerRepo);
    const depositCommitCmdHandler = new DepositCommitCmdHandler(
      offerRepo,
      listingRepo,
    );
    const getDepositCommitQueryHandler = new GetDepositCommitQueryHandler(
      offerRepo,
      listingRepo,
    );

    const offerHttpService = new OfferHTTPService(
      createOfferCmdHandler,
      acceptOfferCmdHandler,
      getOfferDetailQueryHandler,
      listOfferQueryHandler,
      depositCommitCmdHandler,
      getDepositCommitQueryHandler,
    );

    // 5. Build Express app matching index.ts structure
    const app: Express = express();
    app.use(express.json());

    // Public API routes
    app.use("/api/v1", setupListingRoutes(listingHttpService, mdlFactory));
    app.use("/api/v1", setupOfferRoutes(offerHttpService, mdlFactory));

    // Internal API routes (Payment only, protected by X-Service-Key)
    app.use(
      "/internal/v1",
      setupInternalOfferRoutes(
        offerHttpService,
        mdlFactory.serviceKey([TEST_PAYMENT_SERVICE_KEY]),
      ),
    );

    // Error handler
    app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      responseErr(err, req, res);
    });

    // 6. Listen on an ephemeral port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // ─────────────────────────────────────────────────────────────
  // STEP 1: Farmer creates Listing (Status: OPEN)
  // ─────────────────────────────────────────────────────────────
  it("Step 1: Farmer creates Listing -> OPEN", async () => {
    const res = await fetch(`${baseUrl}/api/v1/listings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer farmer-token",
      },
      body: JSON.stringify({
        plotId,
        cropSeasonId,
        expectedPrice: "4500000.00",
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.strictEqual(body.farmerId, farmerId);
    assert.strictEqual(body.status, "OPEN");
    assert.strictEqual(body.seedType, "Jasmine Rice");
    createdListingId = body.listingId;
    assert.ok(createdListingId);
  });

  // ─────────────────────────────────────────────────────────────
  // STEP 2: Trader submits an Offer -> PENDING + Outbox OFFER_CREATED
  // ─────────────────────────────────────────────────────────────
  it("Step 2: Trader creates Offer -> PENDING and writes OFFER_CREATED to outbox", async () => {
    const res = await fetch(`${baseUrl}/api/v1/offers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer trader-token",
      },
      body: JSON.stringify({
        listingId: createdListingId,
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.strictEqual(body.listingId, createdListingId);
    assert.strictEqual(body.farmerId, farmerId);
    assert.strictEqual(body.traderId, traderId);
    assert.strictEqual(body.status, "PENDING");
    createdOfferId = body.offerId;
    assert.ok(createdOfferId);

    // Check outbox table for OFFER_CREATED
    const unpublished = await outboxRepo.getUnpublished(10);
    assert.strictEqual(unpublished.length, 1);
    assert.strictEqual(unpublished[0].eventType, "OFFER_CREATED");
    assert.strictEqual(unpublished[0].publishedAt, null);
  });

  // ─────────────────────────────────────────────────────────────
  // STEP 3: Farmer accepts Offer -> ACCEPTED + Outbox OFFER_ACCEPTED
  // ─────────────────────────────────────────────────────────────
  it("Step 3: Farmer accepts Offer -> ACCEPTED and writes OFFER_ACCEPTED to outbox", async () => {
    const res = await fetch(`${baseUrl}/api/v1/offers/${createdOfferId}/accept`, {
      method: "POST",
      headers: {
        Authorization: "Bearer farmer-token",
      },
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.data.status, "ACCEPTED");

    // Check outbox table now has 2 events
    const unpublished = await outboxRepo.getUnpublished(10);
    assert.strictEqual(unpublished.length, 2);
    assert.strictEqual(unpublished[1].eventType, "OFFER_ACCEPTED");
  });

  // ─────────────────────────────────────────────────────────────
  // STEP 4: Outbox Relay Sweeper publishes batch to Kafka
  // ─────────────────────────────────────────────────────────────
  it("Step 4: OutboxRelay sweep publishes pending events to Kafka broker", async () => {
    const publishedCount = await outboxRelay.publishBatch();
    assert.strictEqual(publishedCount, 2);

    // Verify publisher received both events
    assert.strictEqual(publisher.published.length, 2);
    assert.strictEqual(publisher.published[0].topic, "soa.trading.offer.v1");
    assert.strictEqual(publisher.published[0].payload.eventType, "OFFER_CREATED");
    assert.strictEqual(publisher.published[1].payload.eventType, "OFFER_ACCEPTED");

    // Verify outbox rows are marked published
    const remainingUnpublished = await outboxRepo.getUnpublished(10);
    assert.strictEqual(remainingUnpublished.length, 0);
  });

  // ─────────────────────────────────────────────────────────────
  // STEP 5: Gateway Route Isolation & Service-Key Enforcement
  // ─────────────────────────────────────────────────────────────
  it("Step 5 (Security): Internal route is protected by X-Service-Key and isolated from Gateway", async () => {
    // 5a. Call internal deposit-commit without X-Service-Key -> 403 Forbidden
    const missingKeyRes = await fetch(
      `${baseUrl}/internal/v1/offers/${createdOfferId}/deposit-commit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": trackingId1,
        },
        body: JSON.stringify({
          contractId: contractId1,
          paymentTrackingId: trackingId1,
          depositAmount: "250000.00",
        }),
      },
    );
    assert.strictEqual(missingKeyRes.status, 403);

    // 5b. Call internal deposit-commit with invalid X-Service-Key -> 403 Forbidden
    const invalidKeyRes = await fetch(
      `${baseUrl}/internal/v1/offers/${createdOfferId}/deposit-commit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Key": "forged-or-unauthorized-service-key",
          "Idempotency-Key": trackingId1,
        },
        body: JSON.stringify({
          contractId: contractId1,
          paymentTrackingId: trackingId1,
          depositAmount: "250000.00",
        }),
      },
    );
    assert.strictEqual(invalidKeyRes.status, 403);

    // 5c. Gateway routing check: internal route must not be exposed on /api/v1
    const wrongPathRes = await fetch(
      `${baseUrl}/api/v1/offers/${createdOfferId}/deposit-commit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer trader-token",
        },
        body: JSON.stringify({
          contractId: contractId1,
          paymentTrackingId: trackingId1,
          depositAmount: "250000.00",
        }),
      },
    );
    assert.strictEqual(wrongPathRes.status, 404);
  });

  // ─────────────────────────────────────────────────────────────
  // STEP 6: Payment Service commits deposit -> Listing LOCKED
  // ─────────────────────────────────────────────────────────────
  it("Step 6: Payment Service calls deposit-commit with valid key -> Listing LOCKED", async () => {
    const res = await fetch(
      `${baseUrl}/internal/v1/offers/${createdOfferId}/deposit-commit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Key": TEST_PAYMENT_SERVICE_KEY,
          "Idempotency-Key": trackingId1,
        },
        body: JSON.stringify({
          contractId: contractId1,
          paymentTrackingId: trackingId1,
          depositAmount: "250000.00",
        }),
      },
    );

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(body.data);
    assert.strictEqual(body.data.listingStatus, "LOCKED");
    assert.strictEqual(body.data.contractId, contractId1);
    assert.strictEqual(body.data.paymentTrackingId, trackingId1);

    // Verify DB state
    const listing = await listingRepo.getById(createdListingId);
    assert.strictEqual(listing?.status, "LOCKED");
    assert.strictEqual(listing?.winningContractId, contractId1);
  });

  // ─────────────────────────────────────────────────────────────
  // STEP 7: Deposit-commit Idempotency & Competing Commit Rejection
  // ─────────────────────────────────────────────────────────────
  it("Step 7: Idempotent re-attempt succeeds and competing caller is rejected with 409", async () => {
    // 7a. Re-attempt with exact same idempotency tracking key
    const idempotentRes = await fetch(
      `${baseUrl}/internal/v1/offers/${createdOfferId}/deposit-commit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Key": TEST_PAYMENT_SERVICE_KEY,
          "Idempotency-Key": trackingId1,
        },
        body: JSON.stringify({
          contractId: contractId1,
          paymentTrackingId: trackingId1,
          depositAmount: "250000.00",
        }),
      },
    );
    assert.strictEqual(idempotentRes.status, 200);
    const idempotentBody = (await idempotentRes.json()) as any;
    assert.strictEqual(idempotentBody.data.contractId, contractId1);

    // 7b. Competing commit from another contract/tracking key -> 409
    const competingRes = await fetch(
      `${baseUrl}/internal/v1/offers/${createdOfferId}/deposit-commit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Key": TEST_PAYMENT_SERVICE_KEY,
          "Idempotency-Key": competingTrackingId,
        },
        body: JSON.stringify({
          contractId: competingContractId,
          paymentTrackingId: competingTrackingId,
          depositAmount: "300000.00",
        }),
      },
    );
    assert.strictEqual(competingRes.status, 409);
    const competingBody = (await competingRes.json()) as any;
    assert.strictEqual(competingBody.code, "LISTING_ALREADY_COMMITTED");
  });

  // ─────────────────────────────────────────────────────────────
  // STEP 8: Kafka Consumer DEPOSIT_PAID updates Offer.depositAmount
  // ─────────────────────────────────────────────────────────────
  it("Step 8: Kafka consumer processes DEPOSIT_PAID event -> updates Offer.depositAmount", async () => {
    const depositEnvelope: EventEnvelope<DepositPaidEventData> = {
      eventId: uuidv7(),
      eventType: EVENT_DEPOSIT_PAID,
      eventVersion: 1,
      sourceService: "payment-service",
      occurredAt: new Date().toISOString(),
      actorId: traderId,
      recipientIds: [farmerId],
      referenceType: "OFFER",
      referenceId: createdOfferId,
      correlationId: null,
      data: {
        offerId: createdOfferId,
        contractId: contractId1,
        depositId: uuidv7(),
        amount: 250000.0,
      },
    };

    const handled = await depositPaidHandler.handle(depositEnvelope);
    assert.strictEqual(handled, true);

    const updatedOffer = await offerRepo.getById(createdOfferId);
    assert.strictEqual(updatedOffer?.depositAmount, "250000.00");
  });

  // ─────────────────────────────────────────────────────────────
  // STEP 9: Kafka Consumer CONTRACT_STATUS_CHANGED -> Listing SOLD
  // ─────────────────────────────────────────────────────────────
  it("Step 9: Kafka consumer processes CONTRACT_STATUS_CHANGED (COMPLETED) -> Listing SOLD", async () => {
    const contractCompletedEnvelope: EventEnvelope<ContractStatusChangedEventData> = {
      eventId: uuidv7(),
      eventType: EVENT_CONTRACT_STATUS_CHANGED,
      eventVersion: 1,
      sourceService: "payment-service",
      occurredAt: new Date().toISOString(),
      actorId: "system",
      recipientIds: [farmerId, traderId],
      referenceType: "CONTRACT",
      referenceId: contractId1,
      correlationId: null,
      data: {
        contractId: contractId1,
        status: "COMPLETED",
      },
    };

    const handled = await contractStatusHandler.handle(contractCompletedEnvelope);
    assert.strictEqual(handled, true);

    const soldListing = await listingRepo.getById(createdListingId);
    assert.strictEqual(soldListing?.status, "SOLD");
  });

  // ─────────────────────────────────────────────────────────────
  // STEP 10: Robustness Check — Non-matching or Late Contract Events
  // ─────────────────────────────────────────────────────────────
  it("Step 10: Late or unmatched contract event does not modify or revert SOLD listing", async () => {
    const cancelledEnvelope: EventEnvelope<ContractStatusChangedEventData> = {
      eventId: uuidv7(),
      eventType: EVENT_CONTRACT_STATUS_CHANGED,
      eventVersion: 1,
      sourceService: "payment-service",
      occurredAt: new Date().toISOString(),
      actorId: "system",
      recipientIds: [farmerId, traderId],
      referenceType: "CONTRACT",
      referenceId: contractId1,
      correlationId: null,
      data: {
        contractId: contractId1,
        status: "CANCELLED",
      },
    };

    const handled = await contractStatusHandler.handle(cancelledEnvelope);
    // Non-COMPLETED status is ignored
    assert.strictEqual(handled, false);

    // Listing remains SOLD
    const listing = await listingRepo.getById(createdListingId);
    assert.strictEqual(listing?.status, "SOLD");
  });

  // ─────────────────────────────────────────────────────────────
  // STEP 11: Recovery GET endpoint for deposit-commit
  // ─────────────────────────────────────────────────────────────
  it("Step 11: Recovery GET endpoint returns commit result for Payment service", async () => {
    const recoveryRes = await fetch(
      `${baseUrl}/internal/v1/offers/${createdOfferId}/deposit-commit?contractId=${contractId1}&paymentTrackingId=${trackingId1}`,
      {
        headers: {
          "X-Service-Key": TEST_PAYMENT_SERVICE_KEY,
        },
      },
    );

    assert.strictEqual(recoveryRes.status, 200);
    const body = (await recoveryRes.json()) as any;
    assert.strictEqual(body.data.contractId, contractId1);
    assert.strictEqual(body.data.paymentTrackingId, trackingId1);
  });
});
