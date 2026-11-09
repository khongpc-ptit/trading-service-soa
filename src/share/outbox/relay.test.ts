import test, { describe, it } from "node:test";
import assert from "node:assert";
import {
  createOfferAcceptedEnvelope,
  createOfferCreatedEnvelope,
  EVENT_OFFER_ACCEPTED,
  EVENT_OFFER_CREATED,
  TOPIC_TRADING_OFFER,
} from "../event";
import {
  IEventPublisher,
  IOutboxRepository,
  InsertOutboxDTO,
  OutboxEventRecord,
} from "./interface";
import { OutboxRelay } from "./relay";
import { IOfferRepository } from "@modules/offer/interface";
import { IListingRepository } from "@modules/listing/interface";
import {
  Offer,
  OfferCondDTO,
  OfferStatus,
} from "@modules/offer/model";
import {
  DepositCommitResult,
  Listing,
  ListingCondDTO,
  ListingStatus,
} from "@modules/listing/model";
import { PagingDTO } from "@share/model/paging";
import {
  AcceptOfferCmdHandler,
  CreateOfferCmdHandler,
} from "@modules/offer/usecase";

class MockOutboxRepository implements IOutboxRepository {
  public records: OutboxEventRecord[] = [];
  public markedPublishedIds: string[] = [];

  async insert(record: InsertOutboxDTO, _tx?: any): Promise<void> {
    this.records.push({
      eventId: record.eventId,
      eventType: record.eventType,
      topic: record.topic,
      partitionKey: record.partitionKey,
      payload: record.payload,
      publishedAt: null,
      createdAt: new Date(),
    });
  }

  async getUnpublished(batchSize: number = 50): Promise<OutboxEventRecord[]> {
    return this.records
      .filter((r) => r.publishedAt === null)
      .slice(0, batchSize);
  }

  async markPublished(eventIds: string[]): Promise<void> {
    this.markedPublishedIds.push(...eventIds);
    for (const id of eventIds) {
      const rec = this.records.find((r) => r.eventId === id);
      if (rec) {
        rec.publishedAt = new Date();
      }
    }
  }
}

class MockEventPublisher implements IEventPublisher {
  public published: Array<{
    topic: string;
    partitionKey: string;
    payload: any;
  }> = [];
  public failOnEventId: string | null = null;

  async publish(
    topic: string,
    partitionKey: string,
    payload: any,
  ): Promise<void> {
    if (this.failOnEventId && payload?.eventId === this.failOnEventId) {
      throw new Error(`Simulated Kafka publish failure for ${this.failOnEventId}`);
    }
    this.published.push({ topic, partitionKey, payload });
  }
}

class MockOfferRepository implements IOfferRepository {
  public offers: Offer[] = [];
  public transactionExecuted = false;

  async insert(offer: Offer, _tx?: any): Promise<void> {
    this.offers.push({ ...offer });
  }

  async getById(offerId: string): Promise<Offer | null> {
    return this.offers.find((o) => o.offerId === offerId) || null;
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
    _cond: OfferCondDTO,
    _paging: PagingDTO,
  ): Promise<{ items: Offer[]; total: number }> {
    return { items: this.offers, total: this.offers.length };
  }

  async runTransaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
    this.transactionExecuted = true;
    return work({});
  }
}

class MockListingRepository implements IListingRepository {
  public listings: Listing[] = [];

  async insert(listing: Listing): Promise<void> {
    this.listings.push(listing);
  }

  async getById(listingId: string): Promise<Listing | null> {
    return this.listings.find((l) => l.listingId === listingId) || null;
  }

  async list(
    _cond: ListingCondDTO,
    _paging: PagingDTO,
  ): Promise<{ items: Listing[]; total: number }> {
    return { items: this.listings, total: this.listings.length };
  }

  async tryCommitDeposit(
    _offerId: string,
    _contractId: string,
    _paymentTrackingId: string,
    _depositAmount: string,
  ): Promise<DepositCommitResult | "already_committed"> {
    return "already_committed";
  }

  async getCommitResult(_listingId: string): Promise<DepositCommitResult | null> {
    return null;
  }

  async markSold(
    _listingId: string,
    _winningContractId: string,
  ): Promise<boolean> {
    return true;
  }
}

describe("Phase 6 - Event Envelopes & Outbox Relay", () => {
  const farmerId = "11111111-1111-1111-1111-111111111111";
  const traderId = "22222222-2222-2222-2222-222222222222";
  const listingId = "33333333-3333-3333-3333-333333333333";
  const offerId = "44444444-4444-4444-4444-444444444444";

  it("createOfferCreatedEnvelope formats payload compliant with BA-SOA §10", () => {
    const createdAt = new Date();
    const envelope = createOfferCreatedEnvelope({
      offerId,
      listingId,
      traderId,
      farmerId,
      depositAmount: "0.00",
      status: "PENDING",
      createdAt,
    });

    assert.strictEqual(envelope.eventType, EVENT_OFFER_CREATED);
    assert.strictEqual(envelope.eventVersion, 1);
    assert.strictEqual(envelope.sourceService, "trading-service");
    assert.strictEqual(envelope.actorId, traderId);
    assert.deepStrictEqual(envelope.recipientIds, [farmerId]);
    assert.strictEqual(envelope.referenceType, "OFFER");
    assert.strictEqual(envelope.referenceId, offerId);
    assert.strictEqual(envelope.data.offerId, offerId);
    assert.strictEqual(envelope.data.listingId, listingId);
    assert.strictEqual(envelope.data.traderId, traderId);
    assert.strictEqual(envelope.data.farmerId, farmerId);
    assert.strictEqual(envelope.data.depositAmount, "0.00");
    assert.strictEqual(envelope.data.status, "PENDING");
    assert.ok(envelope.eventId);
    assert.ok(envelope.occurredAt);
  });

  it("createOfferAcceptedEnvelope formats payload compliant with BA-SOA §10", () => {
    const updatedAt = new Date();
    const envelope = createOfferAcceptedEnvelope({
      offerId,
      listingId,
      farmerId,
      traderId,
      depositAmount: "0.00",
      status: "ACCEPTED",
      updatedAt,
    });

    assert.strictEqual(envelope.eventType, EVENT_OFFER_ACCEPTED);
    assert.strictEqual(envelope.eventVersion, 1);
    assert.strictEqual(envelope.sourceService, "trading-service");
    assert.strictEqual(envelope.actorId, farmerId);
    assert.deepStrictEqual(envelope.recipientIds, [traderId]);
    assert.strictEqual(envelope.referenceType, "OFFER");
    assert.strictEqual(envelope.referenceId, offerId);
    assert.strictEqual(envelope.data.offerId, offerId);
    assert.strictEqual(envelope.data.status, "ACCEPTED");
  });

  it("OutboxRelay.publishBatch() publishes unpublished records and marks them published", async () => {
    const outboxRepo = new MockOutboxRepository();
    const publisher = new MockEventPublisher();
    const relay = new OutboxRelay(outboxRepo, publisher, 100, 10);

    // Add 2 mock outbox records
    await outboxRepo.insert({
      eventId: "event-1",
      eventType: EVENT_OFFER_CREATED,
      topic: TOPIC_TRADING_OFFER,
      partitionKey: offerId,
      payload: { eventId: "event-1", message: "offer 1" },
    });
    await outboxRepo.insert({
      eventId: "event-2",
      eventType: EVENT_OFFER_ACCEPTED,
      topic: TOPIC_TRADING_OFFER,
      partitionKey: offerId,
      payload: { eventId: "event-2", message: "offer 2" },
    });

    const publishedCount = await relay.publishBatch();
    assert.strictEqual(publishedCount, 2);
    assert.strictEqual(publisher.published.length, 2);
    assert.strictEqual(publisher.published[0].topic, TOPIC_TRADING_OFFER);
    assert.strictEqual(publisher.published[0].partitionKey, offerId);
    assert.deepStrictEqual(outboxRepo.markedPublishedIds, ["event-1", "event-2"]);

    // Subsequent batch should find 0 unpublished records
    const nextBatch = await relay.publishBatch();
    assert.strictEqual(nextBatch, 0);
  });

  it("OutboxRelay preserves order by halting batch when publisher fails", async () => {
    const outboxRepo = new MockOutboxRepository();
    const publisher = new MockEventPublisher();
    const relay = new OutboxRelay(outboxRepo, publisher, 100, 10);

    await outboxRepo.insert({
      eventId: "event-ok",
      eventType: EVENT_OFFER_CREATED,
      topic: TOPIC_TRADING_OFFER,
      partitionKey: offerId,
      payload: { eventId: "event-ok" },
    });
    await outboxRepo.insert({
      eventId: "event-fail",
      eventType: EVENT_OFFER_ACCEPTED,
      topic: TOPIC_TRADING_OFFER,
      partitionKey: offerId,
      payload: { eventId: "event-fail" },
    });
    await outboxRepo.insert({
      eventId: "event-later",
      eventType: EVENT_OFFER_ACCEPTED,
      topic: TOPIC_TRADING_OFFER,
      partitionKey: offerId,
      payload: { eventId: "event-later" },
    });

    publisher.failOnEventId = "event-fail";

    const publishedCount = await relay.publishBatch();
    // Only event-ok should be marked published; event-fail and event-later remain unpublished
    assert.strictEqual(publishedCount, 1);
    assert.deepStrictEqual(outboxRepo.markedPublishedIds, ["event-ok"]);
    assert.strictEqual(outboxRepo.records[0].publishedAt !== null, true);
    assert.strictEqual(outboxRepo.records[1].publishedAt, null);
    assert.strictEqual(outboxRepo.records[2].publishedAt, null);
  });

  it("OutboxRelay start and stop controls interval timer lifecycle", () => {
    const outboxRepo = new MockOutboxRepository();
    const publisher = new MockEventPublisher();
    const relay = new OutboxRelay(outboxRepo, publisher, 1000, 10);

    relay.start();
    // Calling start again is idempotent
    relay.start();
    relay.stop();
    // Calling stop again is safe
    relay.stop();
  });

  it("CreateOfferCmdHandler inserts outbox event in transaction", async () => {
    const offerRepo = new MockOfferRepository();
    const listingRepo = new MockListingRepository();
    const outboxRepo = new MockOutboxRepository();

    listingRepo.listings.push({
      listingId,
      farmerId,
      plotId: "plot-1",
      cropSeasonId: "season-1",
      seedType: "ST25",
      estimatedYield: 10,
      area: 2,
      latitude: 10,
      longitude: 106,
      expectedPrice: "4000000.00",
      status: ListingStatus.OPEN,
      winningContractId: null,
      winningPaymentTrackingId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const handler = new CreateOfferCmdHandler(offerRepo, listingRepo, outboxRepo);
    const result = await handler.execute({
      traderId,
      dto: {
        listingId,
      },
    });

    assert.ok(result.offerId);
    assert.strictEqual(result.status, OfferStatus.PENDING);
    assert.strictEqual(offerRepo.transactionExecuted, true);
    assert.strictEqual(offerRepo.offers.length, 1);
    assert.strictEqual(outboxRepo.records.length, 1);
    assert.strictEqual(outboxRepo.records[0].eventType, EVENT_OFFER_CREATED);
    assert.strictEqual(outboxRepo.records[0].topic, TOPIC_TRADING_OFFER);
    assert.strictEqual(outboxRepo.records[0].partitionKey, result.offerId);
    assert.strictEqual(outboxRepo.records[0].payload.actorId, traderId);
  });

  it("AcceptOfferCmdHandler updates status and inserts outbox event in transaction", async () => {
    const offerRepo = new MockOfferRepository();
    const listingRepo = new MockListingRepository();
    const outboxRepo = new MockOutboxRepository();

    listingRepo.listings.push({
      listingId,
      farmerId,
      plotId: "plot-1",
      cropSeasonId: "season-1",
      seedType: "ST25",
      estimatedYield: 10,
      area: 2,
      latitude: 10,
      longitude: 106,
      expectedPrice: "4000000.00",
      status: ListingStatus.OPEN,
      winningContractId: null,
      winningPaymentTrackingId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    offerRepo.offers.push({
      offerId,
      listingId,
      traderId,
      farmerId,
      status: OfferStatus.PENDING,
      depositAmount: "0.00",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const handler = new AcceptOfferCmdHandler(offerRepo, listingRepo, outboxRepo);
    const result = await handler.execute({
      farmerId,
      offerId,
    });

    assert.strictEqual(result.status, OfferStatus.ACCEPTED);
    assert.strictEqual(offerRepo.transactionExecuted, true);
    assert.strictEqual(outboxRepo.records.length, 1);
    assert.strictEqual(outboxRepo.records[0].eventType, EVENT_OFFER_ACCEPTED);
    assert.strictEqual(outboxRepo.records[0].partitionKey, offerId);
    assert.strictEqual(outboxRepo.records[0].payload.actorId, farmerId);
    assert.deepStrictEqual(outboxRepo.records[0].payload.recipientIds, [traderId]);

    // Test idempotent accept: accepting already ACCEPTED offer should not insert second outbox event
    const secondResult = await handler.execute({ farmerId, offerId });
    assert.strictEqual(secondResult.status, OfferStatus.ACCEPTED);
    assert.strictEqual(outboxRepo.records.length, 1);
  });
});
