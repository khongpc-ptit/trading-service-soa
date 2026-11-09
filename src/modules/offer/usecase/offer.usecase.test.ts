import test, { describe, it } from "node:test";
import assert from "node:assert";
import { AppError } from "@share/app-error";
import { UserRole } from "@share/interface";
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
  AcceptOfferCmdHandler,
  CreateOfferCmdHandler,
  GetOfferDetailQueryHandler,
  ListOfferQueryHandler,
  OfferUseCase,
} from "./index";

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
    if (cond.farmerId) {
      filtered = filtered.filter((o) => o.farmerId === cond.farmerId);
    }
    if (cond.traderId) {
      filtered = filtered.filter((o) => o.traderId === cond.traderId);
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
}

describe("Offer Module - CQRS Handlers and Use Case", () => {
  const farmerId = "11111111-1111-1111-1111-111111111111";
  const traderId = "22222222-2222-2222-2222-222222222222";
  const otherUserId = "33333333-3333-3333-3333-333333333333";
  const listingId = "44444444-4444-4444-4444-444444444444";

  const sampleListing: Listing = {
    listingId,
    farmerId,
    plotId: "55555555-5555-5555-5555-555555555555",
    cropSeasonId: "66666666-6666-6666-6666-666666666666",
    seedType: "ST25 Rice",
    estimatedYield: 15.5,
    area: 2.5,
    latitude: 10.76,
    longitude: 106.66,
    expectedPrice: "4600000.00",
    status: ListingStatus.OPEN,
    winningContractId: null,
    winningPaymentTrackingId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("CreateOfferCmdHandler creates an offer on an OPEN listing", async () => {
    const offerRepo = new MockOfferRepository();
    const listingRepo = new MockListingRepository();
    listingRepo.listings.push({ ...sampleListing });

    const createCmdHandler = new CreateOfferCmdHandler(offerRepo, listingRepo);

    const result = await createCmdHandler.execute({
      traderId,
      dto: { listingId },
    });

    assert.strictEqual(result.listingId, listingId);
    assert.strictEqual(result.farmerId, farmerId);
    assert.strictEqual(result.traderId, traderId);
    assert.strictEqual(result.depositAmount, "0.00");
    assert.strictEqual(result.status, OfferStatus.PENDING);
    assert.strictEqual(offerRepo.offers.length, 1);
  });

  it("CreateOfferCmdHandler throws 404 if listing does not exist", async () => {
    const offerRepo = new MockOfferRepository();
    const listingRepo = new MockListingRepository();

    const createCmdHandler = new CreateOfferCmdHandler(offerRepo, listingRepo);

    await assert.rejects(
      async () => {
        await createCmdHandler.execute({
          traderId,
          dto: { listingId: "00000000-0000-0000-0000-000000000000" },
        });
      },
      (err: any) => {
        assert(err instanceof AppError);
        assert.strictEqual(err.getStatusCode(), 404);
        assert.strictEqual(err.getCode(), "NOT_FOUND");
        return true;
      },
    );
  });

  it("CreateOfferCmdHandler throws 409 if listing is not OPEN (e.g. LOCKED)", async () => {
    const offerRepo = new MockOfferRepository();
    const listingRepo = new MockListingRepository();
    listingRepo.listings.push({
      ...sampleListing,
      status: ListingStatus.LOCKED,
    });

    const createCmdHandler = new CreateOfferCmdHandler(offerRepo, listingRepo);

    await assert.rejects(
      async () => {
        await createCmdHandler.execute({
          traderId,
          dto: { listingId },
        });
      },
      (err: any) => {
        assert(err instanceof AppError);
        assert.strictEqual(err.getStatusCode(), 409);
        assert.strictEqual(err.getCode(), "LISTING_NOT_OPEN");
        return true;
      },
    );
  });

  it("CreateOfferCmdHandler throws 400 if farmer makes an offer on their own listing", async () => {
    const offerRepo = new MockOfferRepository();
    const listingRepo = new MockListingRepository();
    listingRepo.listings.push({ ...sampleListing });

    const createCmdHandler = new CreateOfferCmdHandler(offerRepo, listingRepo);

    await assert.rejects(
      async () => {
        await createCmdHandler.execute({
          traderId: farmerId, // farmerId as traderId
          dto: { listingId },
        });
      },
      (err: any) => {
        assert(err instanceof AppError);
        assert.strictEqual(err.getStatusCode(), 400);
        return true;
      },
    );
  });

  it("AcceptOfferCmdHandler transitions offer to ACCEPTED when called by farmer owner", async () => {
    const offerRepo = new MockOfferRepository();
    const listingRepo = new MockListingRepository();
    listingRepo.listings.push({ ...sampleListing });

    const createCmdHandler = new CreateOfferCmdHandler(offerRepo, listingRepo);
    const acceptCmdHandler = new AcceptOfferCmdHandler(offerRepo, listingRepo);

    const created = await createCmdHandler.execute({
      traderId,
      dto: { listingId },
    });

    const accepted = await acceptCmdHandler.execute({
      farmerId,
      offerId: created.offerId,
    });

    assert.strictEqual(accepted.status, OfferStatus.ACCEPTED);
    const inDb = await offerRepo.getById(created.offerId);
    assert.strictEqual(inDb?.status, OfferStatus.ACCEPTED);
  });

  it("AcceptOfferCmdHandler is idempotent if offer is already ACCEPTED", async () => {
    const offerRepo = new MockOfferRepository();
    const listingRepo = new MockListingRepository();
    listingRepo.listings.push({ ...sampleListing });

    const createCmdHandler = new CreateOfferCmdHandler(offerRepo, listingRepo);
    const acceptCmdHandler = new AcceptOfferCmdHandler(offerRepo, listingRepo);

    const created = await createCmdHandler.execute({
      traderId,
      dto: { listingId },
    });

    await acceptCmdHandler.execute({
      farmerId,
      offerId: created.offerId,
    });

    // Accept second time
    const result2 = await acceptCmdHandler.execute({
      farmerId,
      offerId: created.offerId,
    });

    assert.strictEqual(result2.status, OfferStatus.ACCEPTED);
  });

  it("AcceptOfferCmdHandler throws 403 if called by someone other than the farmer owner", async () => {
    const offerRepo = new MockOfferRepository();
    const listingRepo = new MockListingRepository();
    listingRepo.listings.push({ ...sampleListing });

    const createCmdHandler = new CreateOfferCmdHandler(offerRepo, listingRepo);
    const acceptCmdHandler = new AcceptOfferCmdHandler(offerRepo, listingRepo);

    const created = await createCmdHandler.execute({
      traderId,
      dto: { listingId },
    });

    await assert.rejects(
      async () => {
        await acceptCmdHandler.execute({
          farmerId: otherUserId, // Not owner
          offerId: created.offerId,
        });
      },
      (err: any) => {
        assert(err instanceof AppError);
        assert.strictEqual(err.getStatusCode(), 403);
        assert.strictEqual(err.getCode(), "FORBIDDEN");
        return true;
      },
    );
  });

  it("GetOfferDetailQueryHandler returns offer for participants and blocks outsiders", async () => {
    const offerRepo = new MockOfferRepository();
    const listingRepo = new MockListingRepository();
    listingRepo.listings.push({ ...sampleListing });

    const createCmdHandler = new CreateOfferCmdHandler(offerRepo, listingRepo);
    const getDetailQueryHandler = new GetOfferDetailQueryHandler(offerRepo);

    const created = await createCmdHandler.execute({
      traderId,
      dto: { listingId },
    });

    // Trader can view
    const viewByTrader = await getDetailQueryHandler.query({
      offerId: created.offerId,
      requesterId: traderId,
      requesterRole: UserRole.TRADER,
    });
    assert.strictEqual(viewByTrader.offerId, created.offerId);

    // Farmer can view
    const viewByFarmer = await getDetailQueryHandler.query({
      offerId: created.offerId,
      requesterId: farmerId,
      requesterRole: UserRole.FARMER,
    });
    assert.strictEqual(viewByFarmer.offerId, created.offerId);

    // Admin can view
    const viewByAdmin = await getDetailQueryHandler.query({
      offerId: created.offerId,
      requesterId: "99999999-9999-9999-9999-999999999999",
      requesterRole: UserRole.ADMIN,
    });
    assert.strictEqual(viewByAdmin.offerId, created.offerId);

    // Outsider is blocked
    await assert.rejects(
      async () => {
        await getDetailQueryHandler.query({
          offerId: created.offerId,
          requesterId: otherUserId,
          requesterRole: UserRole.TRADER,
        });
      },
      (err: any) => {
        assert(err instanceof AppError);
        assert.strictEqual(err.getStatusCode(), 403);
        return true;
      },
    );
  });

  it("ListOfferQueryHandler and OfferUseCase facade work correctly", async () => {
    const offerRepo = new MockOfferRepository();
    const listingRepo = new MockListingRepository();
    listingRepo.listings.push({ ...sampleListing });

    const useCase = new OfferUseCase(offerRepo, listingRepo);

    const created = await useCase.createOffer(traderId, { listingId });
    assert.strictEqual(created.status, OfferStatus.PENDING);

    const listResult = await useCase.listOffers(
      { listingId },
      { page: 0, size: 10 },
      farmerId,
      UserRole.FARMER,
    );
    assert.strictEqual(listResult.items.length, 1);
    assert.strictEqual(listResult.totalElements, 1);

    const accepted = await useCase.acceptOffer(farmerId, created.offerId);
    assert.strictEqual(accepted.status, OfferStatus.ACCEPTED);
  });
});

