import { v7 } from "uuid";

// ─── Topics (BA-SOA §8, §10) ────────────────────────────

export const TOPIC_TRADING_OFFER = "soa.trading.offer.v1";

// ─── Event Types ────────────────────────────────────────

export const EVENT_OFFER_CREATED = "OFFER_CREATED";
export const EVENT_OFFER_ACCEPTED = "OFFER_ACCEPTED";

// ─── Approved Event Envelope (BA-SOA §8 & §10) ──────────

export interface EventEnvelope<T = any> {
  eventId: string;
  eventType: string;
  eventVersion: number;
  sourceService: string;
  occurredAt: string;
  actorId: string | null;
  recipientIds: string[];
  referenceType: string;
  referenceId: string;
  correlationId?: string | null;
  data: T;
}

// ─── Offer Event Payloads ───────────────────────────────

export interface OfferCreatedEventData {
  offerId: string;
  listingId: string;
  farmerId: string;
  traderId: string;
  depositAmount: string;
  status: string;
  createdAt: string;
}

export interface OfferAcceptedEventData {
  offerId: string;
  listingId: string;
  farmerId: string;
  traderId: string;
  depositAmount: string;
  status: string;
  updatedAt: string;
}

// ─── Factory Helpers ────────────────────────────────────

export function createOfferCreatedEnvelope(data: {
  offerId: string;
  listingId: string;
  farmerId: string;
  traderId: string;
  depositAmount: string;
  status: string;
  createdAt: Date;
}): EventEnvelope<OfferCreatedEventData> {
  return {
    eventId: v7(),
    eventType: EVENT_OFFER_CREATED,
    eventVersion: 1,
    sourceService: "trading-service",
    occurredAt: new Date().toISOString(),
    actorId: data.traderId,
    recipientIds: [data.farmerId],
    referenceType: "OFFER",
    referenceId: data.offerId,
    correlationId: null,
    data: {
      offerId: data.offerId,
      listingId: data.listingId,
      farmerId: data.farmerId,
      traderId: data.traderId,
      depositAmount: data.depositAmount,
      status: data.status,
      createdAt: data.createdAt.toISOString(),
    },
  };
}

export function createOfferAcceptedEnvelope(data: {
  offerId: string;
  listingId: string;
  farmerId: string;
  traderId: string;
  depositAmount: string;
  status: string;
  updatedAt: Date;
}): EventEnvelope<OfferAcceptedEventData> {
  return {
    eventId: v7(),
    eventType: EVENT_OFFER_ACCEPTED,
    eventVersion: 1,
    sourceService: "trading-service",
    occurredAt: new Date().toISOString(),
    actorId: data.farmerId,
    recipientIds: [data.traderId],
    referenceType: "OFFER",
    referenceId: data.offerId,
    correlationId: null,
    data: {
      offerId: data.offerId,
      listingId: data.listingId,
      farmerId: data.farmerId,
      traderId: data.traderId,
      depositAmount: data.depositAmount,
      status: data.status,
      updatedAt: data.updatedAt.toISOString(),
    },
  };
}

