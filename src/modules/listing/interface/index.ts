import { PagingDTO, PagingResponse } from "@share/model/paging";
import {
  CreateListingDTO,
  DepositCommitResult,
  FarmingSnapshotDTO,
  Listing,
  ListingCondDTO,
  ListingResponseDTO,
} from "../model";

// ─── Repository Port ────────────────────────────────────

export interface IListingRepository {
  insert(listing: Listing): Promise<void>;
  getById(listingId: string): Promise<Listing | null>;
  list(cond: ListingCondDTO, paging: PagingDTO): Promise<{ items: Listing[]; total: number }>;

  /**
   * Atomically lock a Listing for exclusive deposit-commit.
   * Uses SELECT FOR UPDATE on the listings row.
   * Returns DepositCommitResult if this key wins.
   * Returns 'already_committed' if a DIFFERENT key already won.
   * Returns the existing result if the SAME key already committed (idempotent).
   */
  tryCommitDeposit(
    offerId: string,
    contractId: string,
    paymentTrackingId: string,
    depositAmount: string,
  ): Promise<DepositCommitResult | 'already_committed'>;

  /** Recovery: read existing commit result. */
  getCommitResult(listingId: string): Promise<DepositCommitResult | null>;

  /** Kafka consumer: set listing SOLD if winningContractId matches. */
  markSold(listingId: string, winningContractId: string): Promise<boolean>;
}

// ─── Farming RPC Port ───────────────────────────────────

export interface IFarmingRpc {
  getPlotSummary(plotId: string, cropSeasonId: string): Promise<FarmingSnapshotDTO>;
}

// ─── Use-Case Port ──────────────────────────────────────

export interface IListingUseCase {
  /** Farmer creates a new listing from Farming snapshot. */
  createListing(farmerId: string, dto: CreateListingDTO): Promise<ListingResponseDTO>;

  /** Get a single listing by ID. */
  getListing(listingId: string): Promise<ListingResponseDTO>;

  /** List listings with filter/paging (GPS feed for Traders). */
  listListings(cond: ListingCondDTO, paging: PagingDTO): Promise<PagingResponse<ListingResponseDTO>>;
}
