import test, { describe, it } from "node:test";
import assert from "node:assert";
import { Request, Response } from "express";
import { AppError } from "@share/app-error";
import { serviceKeyMiddleware } from "@share/middleware/service-key";
import { PagingDTO } from "@share/model/paging";
import { IListingRepository } from "@modules/listing/interface";
import {
  DepositCommitResult,
  Listing,
  ListingCondDTO,
  ListingStatus,
} from "@modules/listing/model";
import { IOfferRepository } from "../interface";
import {
  Offer,
  OfferCondDTO,
  OfferStatus,
} from "../model";
import {
  DepositCommitCmdHandler,
  GetDepositCommitQueryHandler,
  OfferUseCase,
} from "./index";
import { OfferHTTPService } from "../infras/transport";

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
    return true;
  }

  async list(
    cond: OfferCondDTO,
    paging: PagingDTO,
  ): Promise<{ items: Offer[]; total: number }> {
    return { items: this.offers, total: this.offers.length };
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
    offerId: string,
    contractId: string,
    paymentTrackingId: string,
    _depositAmount: string,
  ): Promise<DepositCommitResult | "already_committed"> {
    // Find listing for this offer in test context
    const listing = this.listings[0];
    if (!listing) return "already_committed";

    // Idempotency: same tracking key
    if (listing.winningPaymentTrackingId === paymentTrackingId) {
      if (listing.winningContractId === contractId) {
        return {
          offerId,
          listingId: listing.listingId,
          contractId,
          paymentTrackingId,
          listingStatus: "LOCKED",
        };
      }
      return "already_committed";
    }

    // Another winner or not OPEN
    if (listing.winningContractId !== null || listing.status !== ListingStatus.OPEN) {
      return "already_committed";
    }

    // Atomically set winner + LOCKED
    listing.status = ListingStatus.LOCKED;
    listing.winningContractId = contractId;
    listing.winningPaymentTrackingId = paymentTrackingId;

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
    offerId: string = "",
  ): Promise<DepositCommitResult | null> {
    const listing = this.listings.find((l) => l.listingId === listingId);
    if (!listing || !listing.winningContractId || !listing.winningPaymentTrackingId) {
      return null;
    }

    return {
      offerId,
      listingId: listing.listingId,
      contractId: listing.winningContractId,
      paymentTrackingId: listing.winningPaymentTrackingId,
      listingStatus: "LOCKED",
    };
  }

  async markSold(
    listingId: string,
    winningContractId: string,
  ): Promise<boolean> {
    const listing = this.listings.find((l) => l.listingId === listingId);
    if (listing && listing.winningContractId === winningContractId) {
      listing.status = ListingStatus.SOLD;
      return true;
    }
    return false;
  }
}

describe("Phase 7 — Internal Deposit-Commit API & Concurrency", () => {
  const farmerId = "11111111-1111-1111-1111-111111111111";
  const traderId = "22222222-2222-2222-2222-222222222222";
  const listingId = "33333333-3333-3333-3333-333333333333";
  const offerId = "44444444-4444-4444-4444-444444444444";
  const contractId1 = "55555555-5555-5555-5555-555555555555";
  const trackingId1 = "66666666-6666-6666-6666-666666666666";
  const contractId2 = "77777777-7777-7777-7777-777777777777";
  const trackingId2 = "88888888-8888-8888-8888-888888888888";

  const setupTestRepos = () => {
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
      farmerId,
      traderId,
      depositAmount: "0.00",
      status: OfferStatus.ACCEPTED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { offerRepo, listingRepo };
  };

  it("DepositCommitCmdHandler successfully locks listing on first call", async () => {
    const { offerRepo, listingRepo } = setupTestRepos();
    const handler = new DepositCommitCmdHandler(offerRepo, listingRepo);

    const result = await handler.execute({
      offerId,
      idempotencyKey: trackingId1,
      dto: {
        contractId: contractId1,
        paymentTrackingId: trackingId1,
        depositAmount: "200000.00",
        currency: "VND",
      },
    });

    assert.strictEqual(result.offerId, offerId);
    assert.strictEqual(result.listingId, listingId);
    assert.strictEqual(result.contractId, contractId1);
    assert.strictEqual(result.paymentTrackingId, trackingId1);
    assert.strictEqual(result.listingStatus, "LOCKED");
    assert.strictEqual(listingRepo.listings[0].status, ListingStatus.LOCKED);
    assert.strictEqual(listingRepo.listings[0].winningContractId, contractId1);
    assert.strictEqual(listingRepo.listings[0].winningPaymentTrackingId, trackingId1);
  });

  it("DepositCommitCmdHandler returns existing result for idempotent re-attempt", async () => {
    const { offerRepo, listingRepo } = setupTestRepos();
    const handler = new DepositCommitCmdHandler(offerRepo, listingRepo);

    // First attempt
    await handler.execute({
      offerId,
      dto: {
        contractId: contractId1,
        paymentTrackingId: trackingId1,
        depositAmount: "200000.00",
      },
    });

    // Idempotent retry with same key
    const result2 = await handler.execute({
      offerId,
      idempotencyKey: trackingId1,
      dto: {
        contractId: contractId1,
        paymentTrackingId: trackingId1,
        depositAmount: "200000.00",
      },
    });

    assert.strictEqual(result2.contractId, contractId1);
    assert.strictEqual(result2.paymentTrackingId, trackingId1);
    assert.strictEqual(result2.listingStatus, "LOCKED");
  });

  it("DepositCommitCmdHandler rejects second caller with 409 LISTING_ALREADY_COMMITTED", async () => {
    const { offerRepo, listingRepo } = setupTestRepos();
    const handler = new DepositCommitCmdHandler(offerRepo, listingRepo);

    // Winner 1 commits
    await handler.execute({
      offerId,
      dto: {
        contractId: contractId1,
        paymentTrackingId: trackingId1,
        depositAmount: "200000.00",
      },
    });

    // Competitor 2 attempts to commit on same listing
    await assert.rejects(
      async () => {
        await handler.execute({
          offerId,
          dto: {
            contractId: contractId2,
            paymentTrackingId: trackingId2,
            depositAmount: "200000.00",
          },
        });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.getStatusCode(), 409);
        assert.strictEqual(err.getCode(), "LISTING_ALREADY_COMMITTED");
        return true;
      },
    );
  });

  it("DepositCommitCmdHandler rejects when Idempotency-Key header does not match body", async () => {
    const { offerRepo, listingRepo } = setupTestRepos();
    const handler = new DepositCommitCmdHandler(offerRepo, listingRepo);

    await assert.rejects(
      async () => {
        await handler.execute({
          offerId,
          idempotencyKey: "different-key-uuid",
          dto: {
            contractId: contractId1,
            paymentTrackingId: trackingId1,
            depositAmount: "200000.00",
          },
        });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.getStatusCode(), 400);
        assert.strictEqual(err.getCode(), "VALIDATION_ERROR");
        return true;
      },
    );
  });

  it("DepositCommitCmdHandler throws 404 if offer does not exist", async () => {
    const { offerRepo, listingRepo } = setupTestRepos();
    const handler = new DepositCommitCmdHandler(offerRepo, listingRepo);

    await assert.rejects(
      async () => {
        await handler.execute({
          offerId: "00000000-0000-0000-0000-000000000000",
          dto: {
            contractId: contractId1,
            paymentTrackingId: trackingId1,
            depositAmount: "200000.00",
          },
        });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.getStatusCode(), 404);
        assert.strictEqual(err.getCode(), "OFFER_NOT_FOUND");
        return true;
      },
    );
  });

  it("DepositCommitCmdHandler throws 409 if offer is still PENDING (not ACCEPTED)", async () => {
    const { offerRepo, listingRepo } = setupTestRepos();
    offerRepo.offers[0].status = OfferStatus.PENDING;
    const handler = new DepositCommitCmdHandler(offerRepo, listingRepo);

    await assert.rejects(
      async () => {
        await handler.execute({
          offerId,
          dto: {
            contractId: contractId1,
            paymentTrackingId: trackingId1,
            depositAmount: "200000.00",
          },
        });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.getStatusCode(), 409);
        assert.strictEqual(err.getCode(), "OFFER_NOT_ACCEPTED");
        return true;
      },
    );
  });

  it("GetDepositCommitQueryHandler returns commit result on recovery", async () => {
    const { offerRepo, listingRepo } = setupTestRepos();
    // Simulate listing committed
    listingRepo.listings[0].status = ListingStatus.LOCKED;
    listingRepo.listings[0].winningContractId = contractId1;
    listingRepo.listings[0].winningPaymentTrackingId = trackingId1;

    const queryHandler = new GetDepositCommitQueryHandler(offerRepo, listingRepo);
    const result = await queryHandler.query({
      offerId,
      contractId: contractId1,
      paymentTrackingId: trackingId1,
    });

    assert.strictEqual(result.offerId, offerId);
    assert.strictEqual(result.listingId, listingId);
    assert.strictEqual(result.contractId, contractId1);
    assert.strictEqual(result.paymentTrackingId, trackingId1);
  });

  it("GetDepositCommitQueryHandler returns 404 if commit result does not match query credentials", async () => {
    const { offerRepo, listingRepo } = setupTestRepos();
    listingRepo.listings[0].status = ListingStatus.LOCKED;
    listingRepo.listings[0].winningContractId = contractId1;
    listingRepo.listings[0].winningPaymentTrackingId = trackingId1;

    const queryHandler = new GetDepositCommitQueryHandler(offerRepo, listingRepo);
    await assert.rejects(
      async () => {
        await queryHandler.query({
          offerId,
          contractId: contractId2,
          paymentTrackingId: trackingId2,
        });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.getStatusCode(), 404);
        assert.strictEqual(err.getCode(), "COMMIT_RESULT_NOT_FOUND");
        return true;
      },
    );
  });

  it("serviceKeyMiddleware validates X-Service-Key properly", async () => {
    const middleware = serviceKeyMiddleware(["payment-secret-key-123"]);

    // Missing key
    let errResult: any = null;
    await middleware(
      { headers: {} } as Request,
      {} as Response,
      (err) => {
        errResult = err;
      },
    );
    assert.ok(errResult instanceof AppError);
    assert.strictEqual(errResult.getStatusCode(), 403);

    // Invalid key
    errResult = null;
    await middleware(
      { headers: { "x-service-key": "wrong-key" } } as unknown as Request,
      {} as Response,
      (err) => {
        errResult = err;
      },
    );
    assert.ok(errResult instanceof AppError);
    assert.strictEqual(errResult.getStatusCode(), 403);

    // Valid key
    let nextCalled = false;
    await middleware(
      { headers: { "x-service-key": "payment-secret-key-123" } } as unknown as Request,
      {} as Response,
      (err) => {
        if (!err) nextCalled = true;
      },
    );
    assert.strictEqual(nextCalled, true);
  });

  it("OfferHTTPService depositCommitAPI and getDepositCommitAPI work via HTTP transport", async () => {
    const { offerRepo, listingRepo } = setupTestRepos();
    const cmdHandler = new DepositCommitCmdHandler(offerRepo, listingRepo);
    const queryHandler = new GetDepositCommitQueryHandler(offerRepo, listingRepo);

    const httpService = new OfferHTTPService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      cmdHandler,
      queryHandler,
    );

    // POST API test
    let resData: any = null;
    const mockRes = {
      status: (_code: number) => mockRes,
      json: (data: any) => {
        resData = data;
        return mockRes;
      },
    } as unknown as Response;

    const mockPostReq = {
      params: { offerId },
      headers: { "idempotency-key": trackingId1 },
      body: {
        contractId: contractId1,
        paymentTrackingId: trackingId1,
        depositAmount: "200000.00",
      },
    } as unknown as Request;

    await httpService.depositCommitAPI(mockPostReq, mockRes, () => {});
    assert.ok(resData);
    assert.strictEqual(resData.data.listingStatus, "LOCKED");
    assert.strictEqual(resData.data.winningContractId ?? resData.data.contractId, contractId1);

    // GET API test
    let getResData: any = null;
    const mockGetRes = {
      status: (_code: number) => mockGetRes,
      json: (data: any) => {
        getResData = data;
        return mockGetRes;
      },
    } as unknown as Response;

    const mockGetReq = {
      params: { offerId },
      query: {
        contractId: contractId1,
        paymentTrackingId: trackingId1,
      },
    } as unknown as Request;

    await httpService.getDepositCommitAPI(mockGetReq, mockGetRes, () => {});
    assert.ok(getResData);
    assert.strictEqual(getResData.data.paymentTrackingId, trackingId1);
  });

  it("OfferUseCase facade depositCommit and getDepositCommit delegate correctly", async () => {
    const { offerRepo, listingRepo } = setupTestRepos();
    const facade = new OfferUseCase(offerRepo, listingRepo);

    const result = await facade.depositCommit(offerId, {
      contractId: contractId1,
      paymentTrackingId: trackingId1,
      depositAmount: "200000.00",
    });

    assert.strictEqual(result.listingStatus, "LOCKED");

    const recovery = await facade.getDepositCommit(
      offerId,
      contractId1,
      trackingId1,
    );
    assert.strictEqual(recovery.contractId, contractId1);
    assert.strictEqual(recovery.paymentTrackingId, trackingId1);
  });
});

