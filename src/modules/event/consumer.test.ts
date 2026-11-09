import test, { describe, it } from "node:test";
import assert from "node:assert";
import {
  ContractStatusChangedEventData,
  DepositPaidEventData,
  EVENT_CONTRACT_STATUS_CHANGED,
  EVENT_DEPOSIT_PAID,
  EVENT_USER_PROFILE_UPDATED,
  EventEnvelope,
  UserProfileUpdatedEventData,
} from "@share/event";
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
  FarmerReplica,
  TraderReplica,
  UpsertUserReplicaDTO,
} from "@modules/user-replica/model";
import {
  IUserReplicaRepository,
} from "@modules/user-replica/interface";
import { UserReplicaUseCase } from "@modules/user-replica/usecase";
import { DepositPaidConsumerHandler } from "./consumer/deposit-paid";
import { ContractStatusChangedConsumerHandler } from "./consumer/contract-status";
import { UserProfileUpdatedConsumerHandler } from "./consumer/user-profile";

class MockOfferRepository implements IOfferRepository {
  public offers: Offer[] = [];

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
    return {
      items: filtered.slice(
        paging.page * paging.size,
        (paging.page + 1) * paging.size,
      ),
      total: filtered.length,
    };
  }

  async runTransaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
    return work({});
  }
}

class MockListingRepository implements IListingRepository {
  public listings: Listing[] = [];

  async insert(listing: Listing): Promise<void> {
    this.listings.push({ ...listing });
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
    listingId: string,
    winningContractId: string,
  ): Promise<boolean> {
    const listing = this.listings.find((l) => l.listingId === listingId);
    if (
      listing &&
      listing.winningContractId === winningContractId &&
      listing.status === ListingStatus.LOCKED
    ) {
      listing.status = ListingStatus.SOLD;
      return true;
    }
    return false;
  }

  async markSoldByContractId(winningContractId: string): Promise<boolean> {
    const listing = this.listings.find(
      (l) =>
        l.winningContractId === winningContractId &&
        l.status === ListingStatus.LOCKED,
    );
    if (listing) {
      listing.status = ListingStatus.SOLD;
      return true;
    }
    return false;
  }

  async getByContractId(winningContractId: string): Promise<Listing | null> {
    return (
      this.listings.find((l) => l.winningContractId === winningContractId) ||
      null
    );
  }
}

class MockUserReplicaRepository implements IUserReplicaRepository {
  public farmers: FarmerReplica[] = [];
  public traders: TraderReplica[] = [];

  async upsertFarmer(data: UpsertUserReplicaDTO): Promise<boolean> {
    const existing = this.farmers.find((f) => f.accountId === data.accountId);
    const newVersion = BigInt(data.profileVersion);
    if (existing && BigInt(existing.profileVersion) >= newVersion) {
      return false;
    }

    if (existing) {
      existing.displayName = data.displayName;
      existing.avatarUrl = data.avatarUrl ?? null;
      existing.province = data.province ?? null;
      existing.district = data.district ?? null;
      existing.profileVersion = newVersion;
      existing.publicVisible = data.publicVisible ?? true;
      existing.updatedAt = new Date();
    } else {
      this.farmers.push({
        accountId: data.accountId,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl ?? null,
        province: data.province ?? null,
        district: data.district ?? null,
        joinedAt: new Date(data.joinedAt),
        profileVersion: newVersion,
        publicVisible: data.publicVisible ?? true,
        updatedAt: new Date(),
      });
    }
    return true;
  }

  async upsertTrader(data: UpsertUserReplicaDTO): Promise<boolean> {
    const existing = this.traders.find((t) => t.accountId === data.accountId);
    const newVersion = BigInt(data.profileVersion);
    if (existing && BigInt(existing.profileVersion) >= newVersion) {
      return false;
    }

    if (existing) {
      existing.displayName = data.displayName;
      existing.avatarUrl = data.avatarUrl ?? null;
      existing.province = data.province ?? null;
      existing.district = data.district ?? null;
      existing.profileVersion = newVersion;
      existing.publicVisible = data.publicVisible ?? true;
      existing.updatedAt = new Date();
    } else {
      this.traders.push({
        accountId: data.accountId,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl ?? null,
        province: data.province ?? null,
        district: data.district ?? null,
        joinedAt: new Date(data.joinedAt),
        profileVersion: newVersion,
        publicVisible: data.publicVisible ?? true,
        updatedAt: new Date(),
      });
    }
    return true;
  }

  async getFarmer(accountId: string): Promise<FarmerReplica | null> {
    return this.farmers.find((f) => f.accountId === accountId) || null;
  }

  async getTrader(accountId: string): Promise<TraderReplica | null> {
    return this.traders.find((t) => t.accountId === accountId) || null;
  }
}

describe("Phase 8 — Kafka Consumers", () => {
  const listingId = "11111111-1111-1111-1111-111111111111";
  const offerId = "22222222-2222-2222-2222-222222222222";
  const contractId = "33333333-3333-3333-3333-333333333333";
  const farmerId = "44444444-4444-4444-4444-444444444444";
  const traderId = "55555555-5555-5555-5555-555555555555";

  describe("DEPOSIT_PAID Consumer", () => {
    it("updates depositAmount when event contains direct offerId", async () => {
      const offerRepo = new MockOfferRepository();
      const listingRepo = new MockListingRepository();

      offerRepo.offers.push({
        offerId,
        listingId,
        farmerId,
        traderId,
        depositAmount: "0.00",
        status: OfferStatus.ACCEPTED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const handler = new DepositPaidConsumerHandler(offerRepo, listingRepo);
      const envelope: EventEnvelope<DepositPaidEventData> = {
        eventId: "event-1",
        eventType: EVENT_DEPOSIT_PAID,
        eventVersion: 1,
        sourceService: "payment-service",
        occurredAt: new Date().toISOString(),
        actorId: traderId,
        recipientIds: [farmerId, traderId],
        referenceType: "DEPOSIT",
        referenceId: "deposit-1",
        data: {
          depositId: "deposit-1",
          contractId,
          amount: 250000,
          offerId,
        },
      };

      const result = await handler.handle(envelope);
      assert.strictEqual(result, true);
      assert.strictEqual(offerRepo.offers[0].depositAmount, "250000.00");
    });

    it("resolves offerId via contractId -> listing -> accepted offer", async () => {
      const offerRepo = new MockOfferRepository();
      const listingRepo = new MockListingRepository();

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
        expectedPrice: "5000000.00",
        status: ListingStatus.LOCKED,
        winningContractId: contractId,
        winningPaymentTrackingId: "tracking-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      offerRepo.offers.push({
        offerId,
        listingId,
        farmerId,
        traderId,
        depositAmount: "0.00",
        status: OfferStatus.ACCEPTED,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const handler = new DepositPaidConsumerHandler(offerRepo, listingRepo);
      const envelope: EventEnvelope<DepositPaidEventData> = {
        eventId: "event-2",
        eventType: EVENT_DEPOSIT_PAID,
        eventVersion: 1,
        sourceService: "payment-service",
        occurredAt: new Date().toISOString(),
        actorId: traderId,
        recipientIds: [farmerId, traderId],
        referenceType: "DEPOSIT",
        referenceId: "deposit-2",
        data: {
          depositId: "deposit-2",
          contractId,
          amount: "300000.00",
        },
      };

      const result = await handler.handle(envelope);
      assert.strictEqual(result, true);
      assert.strictEqual(offerRepo.offers[0].depositAmount, "300000.00");
    });

    it("ignores non-DEPOSIT_PAID events", async () => {
      const offerRepo = new MockOfferRepository();
      const listingRepo = new MockListingRepository();
      const handler = new DepositPaidConsumerHandler(offerRepo, listingRepo);

      const envelope: EventEnvelope<any> = {
        eventId: "event-other",
        eventType: "OTHER_EVENT",
        eventVersion: 1,
        sourceService: "payment-service",
        occurredAt: new Date().toISOString(),
        actorId: null,
        recipientIds: [],
        referenceType: "TEST",
        referenceId: "123",
        data: {},
      };

      const result = await handler.handle(envelope);
      assert.strictEqual(result, false);
    });
  });

  describe("CONTRACT_STATUS_CHANGED Consumer", () => {
    it("transitions LOCKED listing to SOLD when contract status is COMPLETED", async () => {
      const listingRepo = new MockListingRepository();
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
        expectedPrice: "5000000.00",
        status: ListingStatus.LOCKED,
        winningContractId: contractId,
        winningPaymentTrackingId: "tracking-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const handler = new ContractStatusChangedConsumerHandler(listingRepo);
      const envelope: EventEnvelope<ContractStatusChangedEventData> = {
        eventId: "event-contract-1",
        eventType: EVENT_CONTRACT_STATUS_CHANGED,
        eventVersion: 1,
        sourceService: "payment-service",
        occurredAt: new Date().toISOString(),
        actorId: traderId,
        recipientIds: [farmerId, traderId],
        referenceType: "CONTRACT",
        referenceId: contractId,
        data: {
          contractId,
          farmerId,
          traderId,
          status: "COMPLETED",
        },
      };

      const result = await handler.handle(envelope);
      assert.strictEqual(result, true);
      assert.strictEqual(listingRepo.listings[0].status, ListingStatus.SOLD);
    });

    it("does NOT transition listing if contract status is ACTIVE or CANCELLED", async () => {
      const listingRepo = new MockListingRepository();
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
        expectedPrice: "5000000.00",
        status: ListingStatus.LOCKED,
        winningContractId: contractId,
        winningPaymentTrackingId: "tracking-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const handler = new ContractStatusChangedConsumerHandler(listingRepo);
      const envelope: EventEnvelope<ContractStatusChangedEventData> = {
        eventId: "event-contract-2",
        eventType: EVENT_CONTRACT_STATUS_CHANGED,
        eventVersion: 1,
        sourceService: "payment-service",
        occurredAt: new Date().toISOString(),
        actorId: farmerId,
        recipientIds: [farmerId, traderId],
        referenceType: "CONTRACT",
        referenceId: contractId,
        data: {
          contractId,
          farmerId,
          traderId,
          status: "ACTIVE",
        },
      };

      const result = await handler.handle(envelope);
      assert.strictEqual(result, false);
      assert.strictEqual(listingRepo.listings[0].status, ListingStatus.LOCKED);
    });

    it("does not modify listing if winningContractId does not match", async () => {
      const listingRepo = new MockListingRepository();
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
        expectedPrice: "5000000.00",
        status: ListingStatus.LOCKED,
        winningContractId: "another-contract-id",
        winningPaymentTrackingId: "tracking-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const handler = new ContractStatusChangedConsumerHandler(listingRepo);
      const envelope: EventEnvelope<ContractStatusChangedEventData> = {
        eventId: "event-contract-3",
        eventType: EVENT_CONTRACT_STATUS_CHANGED,
        eventVersion: 1,
        sourceService: "payment-service",
        occurredAt: new Date().toISOString(),
        actorId: traderId,
        recipientIds: [farmerId, traderId],
        referenceType: "CONTRACT",
        referenceId: contractId,
        data: {
          contractId,
          status: "COMPLETED",
        },
      };

      const result = await handler.handle(envelope);
      assert.strictEqual(result, false);
      assert.strictEqual(listingRepo.listings[0].status, ListingStatus.LOCKED);
    });
  });

  describe("USER_PROFILE_UPDATED Consumer & UserReplica", () => {
    it("upserts farmer replica on profile updated event", async () => {
      const userRepo = new MockUserReplicaRepository();
      const useCase = new UserReplicaUseCase(userRepo);
      const handler = new UserProfileUpdatedConsumerHandler(useCase);

      const envelope: EventEnvelope<UserProfileUpdatedEventData> = {
        eventId: "event-user-1",
        eventType: EVENT_USER_PROFILE_UPDATED,
        eventVersion: 1,
        sourceService: "user-service",
        occurredAt: new Date().toISOString(),
        actorId: farmerId,
        recipientIds: [farmerId],
        referenceType: "USER",
        referenceId: farmerId,
        data: {
          accountId: farmerId,
          role: "FARMER",
          profileVersion: 1,
          publicVisible: true,
          profile: {
            displayName: "Nguyen Van A",
            avatarUrl: "https://example.com/avatar.jpg",
            province: "Dong Thap",
            district: "Thap Muoi",
            joinedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      };

      const result = await handler.handle(envelope);
      assert.strictEqual(result, true);
      assert.strictEqual(userRepo.farmers.length, 1);
      assert.strictEqual(userRepo.farmers[0].displayName, "Nguyen Van A");
      assert.strictEqual(userRepo.farmers[0].province, "Dong Thap");
    });

    it("upserts trader replica on profile updated event", async () => {
      const userRepo = new MockUserReplicaRepository();
      const useCase = new UserReplicaUseCase(userRepo);
      const handler = new UserProfileUpdatedConsumerHandler(useCase);

      const envelope: EventEnvelope<UserProfileUpdatedEventData> = {
        eventId: "event-user-2",
        eventType: EVENT_USER_PROFILE_UPDATED,
        eventVersion: 1,
        sourceService: "user-service",
        occurredAt: new Date().toISOString(),
        actorId: traderId,
        recipientIds: [traderId],
        referenceType: "USER",
        referenceId: traderId,
        data: {
          accountId: traderId,
          role: "TRADER",
          profileVersion: 1,
          publicVisible: true,
          profile: {
            displayName: "Tran Thi B",
            avatarUrl: null,
            province: "Ho Chi Minh",
            district: "District 1",
            joinedAt: "2026-02-01T00:00:00.000Z",
          },
        },
      };

      const result = await handler.handle(envelope);
      assert.strictEqual(result, true);
      assert.strictEqual(userRepo.traders.length, 1);
      assert.strictEqual(userRepo.traders[0].displayName, "Tran Thi B");
    });

    it("prevents out-of-order regression when incoming profileVersion is older or equal", async () => {
      const userRepo = new MockUserReplicaRepository();
      const useCase = new UserReplicaUseCase(userRepo);
      const handler = new UserProfileUpdatedConsumerHandler(useCase);

      // Newer profile version 3 already stored
      userRepo.farmers.push({
        accountId: farmerId,
        displayName: "Nguyen Van A - Latest",
        avatarUrl: null,
        province: "Dong Thap",
        district: "Thap Muoi",
        joinedAt: new Date("2026-01-01T00:00:00.000Z"),
        profileVersion: BigInt(3),
        publicVisible: true,
        updatedAt: new Date(),
      });

      // Stale event with profileVersion 2 arrives
      const staleEnvelope: EventEnvelope<UserProfileUpdatedEventData> = {
        eventId: "event-user-stale",
        eventType: EVENT_USER_PROFILE_UPDATED,
        eventVersion: 1,
        sourceService: "user-service",
        occurredAt: new Date().toISOString(),
        actorId: farmerId,
        recipientIds: [farmerId],
        referenceType: "USER",
        referenceId: farmerId,
        data: {
          accountId: farmerId,
          role: "FARMER",
          profileVersion: 2,
          publicVisible: true,
          profile: {
            displayName: "Nguyen Van A - Stale Old Name",
            avatarUrl: null,
            province: "An Giang",
            district: "Chau Doc",
            joinedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      };

      const result = await handler.handle(staleEnvelope);
      assert.strictEqual(result, false);
      // Data must NOT regress
      assert.strictEqual(
        userRepo.farmers[0].displayName,
        "Nguyen Van A - Latest",
      );
      assert.strictEqual(userRepo.farmers[0].province, "Dong Thap");
    });

    it("sets publicVisible to false when publicVisible is false in event", async () => {
      const userRepo = new MockUserReplicaRepository();
      const useCase = new UserReplicaUseCase(userRepo);
      const handler = new UserProfileUpdatedConsumerHandler(useCase);

      const envelope: EventEnvelope<UserProfileUpdatedEventData> = {
        eventId: "event-user-hide",
        eventType: EVENT_USER_PROFILE_UPDATED,
        eventVersion: 1,
        sourceService: "user-service",
        occurredAt: new Date().toISOString(),
        actorId: farmerId,
        recipientIds: [farmerId],
        referenceType: "USER",
        referenceId: farmerId,
        data: {
          accountId: farmerId,
          role: "FARMER",
          profileVersion: 1,
          publicVisible: false,
          profile: {
            displayName: "Hidden Farmer",
            joinedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      };

      const result = await handler.handle(envelope);
      assert.strictEqual(result, true);
      assert.strictEqual(userRepo.farmers[0].publicVisible, false);
    });
  });
});

