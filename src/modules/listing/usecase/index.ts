import { AppError } from "@share/app-error";
import { PagingDTO, PagingResponse } from "@share/model/paging";
import { v7 } from "uuid";
import { IFarmingRpc, IListingRepository, IListingUseCase } from "../interface";
import {
  CreateListingDTO,
  CreateListingDTOSchema,
  Listing,
  ListingCondDTO,
  ListingCondDTOSchema,
  ListingResponseDTO,
  ListingStatus,
} from "../model";
import {
  ErrFarmerMismatch,
  ErrListingNotFound,
  ErrSnapshotIncomplete,
} from "../model/error";

/**
 * Listing use-case — all business logic lives here (RULE-007).
 * Follows sample's UserUseCase pattern: constructor-injected ports.
 */
export class ListingUseCase implements IListingUseCase {
  constructor(
    private readonly repository: IListingRepository,
    private readonly farmingRpc: IFarmingRpc,
  ) {}

  /**
   * Farmer creates a new listing.
   *
   * BR-TS-001: farmerId from JWT sub, not request body.
   * BR-TS-002: Listing created from Farming snapshot (plotId + cropSeasonId).
   * BR-TS-003: Snapshot missing cropType/GPS/expectedYield → 409 SNAPSHOT_INCOMPLETE.
   * BA-SOA §7: Trading maps cropType→seedType, expectedYield→estimatedYield, lat/lng from snapshot.
   */
  async createListing(farmerId: string, dto: CreateListingDTO): Promise<ListingResponseDTO> {
    // 1. Validate input
    const validatedDto = CreateListingDTOSchema.parse(dto);

    // 2. Fetch snapshot from Farming Service
    const snapshot = await this.farmingRpc.getPlotSummary(
      validatedDto.plotId,
      validatedDto.cropSeasonId,
    );

    // 3. Verify farmer owns the plot (BR-TS-001)
    if (snapshot.farmerId !== farmerId) {
      throw AppError.from(ErrFarmerMismatch, 403)
        .withCode('FORBIDDEN')
        .withLog(`JWT sub ${farmerId} does not match snapshot farmerId ${snapshot.farmerId}`);
    }

    // 4. Validate snapshot completeness (BR-TS-003)
    if (
      !snapshot.currentSeason?.cropType ||
      snapshot.latitude == null ||
      snapshot.longitude == null ||
      !snapshot.currentSeason?.expectedYield
    ) {
      throw AppError.from(ErrSnapshotIncomplete, 409)
        .withCode('SNAPSHOT_INCOMPLETE');
    }

    // 5. Build listing entity — map Farming fields to Trading fields (BA-SOA §7)
    const now = new Date();
    const listing: Listing = {
      listingId:                v7(),
      farmerId,
      plotId:                   validatedDto.plotId,
      cropSeasonId:             validatedDto.cropSeasonId,
      seedType:                 snapshot.currentSeason.cropType,       // cropType → seedType
      estimatedYield:           snapshot.currentSeason.expectedYield,  // expectedYield → estimatedYield
      area:                     snapshot.area,
      latitude:                 snapshot.latitude,
      longitude:                snapshot.longitude,
      expectedPrice:            validatedDto.expectedPrice,
      status:                   ListingStatus.OPEN,
      winningContractId:        null,
      winningPaymentTrackingId: null,
      createdAt:                now,
      updatedAt:                now,
    };

    // 6. Persist
    // TODO (Phase 6): insert + outbox event (OFFER_CREATED is not emitted on listing creation;
    //   only on offer creation. Listing creation has no event in BA-SOA.)
    await this.repository.insert(listing);

    // 7. Return response DTO (BA-SOA §7 Response 201)
    return this.toResponseDTO(listing);
  }

  async getListing(listingId: string): Promise<ListingResponseDTO> {
    const listing = await this.repository.getById(listingId);

    if (!listing) {
      throw AppError.from(ErrListingNotFound, 404)
        .withCode('NOT_FOUND');
    }

    return this.toResponseDTO(listing);
  }

  async listListings(
    cond: ListingCondDTO,
    paging: PagingDTO,
  ): Promise<PagingResponse<ListingResponseDTO>> {
    const validatedCond = ListingCondDTOSchema.parse(cond);

    const { items, total } = await this.repository.list(validatedCond, paging);

    return {
      items: items.map((l) => this.toResponseDTO(l)),
      page: paging.page,
      size: paging.size,
      totalElements: total,
      totalPages: Math.ceil(total / paging.size),
    };
  }

  // ─── Private helpers ───────────────────────────────────

  private toResponseDTO(listing: Listing): ListingResponseDTO {
    return {
      listingId:      listing.listingId,
      farmerId:       listing.farmerId,
      plotId:         listing.plotId,
      cropSeasonId:   listing.cropSeasonId,
      seedType:       listing.seedType,
      estimatedYield: listing.estimatedYield,
      area:           listing.area,
      latitude:       listing.latitude,
      longitude:      listing.longitude,
      expectedPrice:  listing.expectedPrice,
      status:         listing.status,
    };
  }
}
