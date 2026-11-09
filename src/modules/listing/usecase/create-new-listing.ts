import { AppError } from "@share/app-error";
import { ICommandHandler } from "@share/interface";
import { v7 } from "uuid";
import {
  CreateListingCommand,
  IFarmingRpc,
  IListingRepository,
} from "../interface";
import {
  CreateListingDTOSchema,
  Listing,
  ListingResponseDTO,
  ListingStatus,
  toListingResponseDTO,
} from "../model";
import {
  ErrFarmerMismatch,
  ErrSnapshotIncomplete,
} from "../model/error";

/**
 * Create listing command handler.
 * Follows sample/brand CQRS usecase pattern: implements ICommandHandler<CreateListingCommand, ListingResponseDTO>.
 *
 * BR-TS-001: farmerId from JWT sub, not request body.
 * BR-TS-002: Listing created from Farming snapshot (plotId + cropSeasonId).
 * BR-TS-003: Snapshot missing cropType/GPS/expectedYield → 409 SNAPSHOT_INCOMPLETE.
 * BA-SOA §7: Maps cropType→seedType, expectedYield→estimatedYield, lat/lng from snapshot.
 */
export class CreateNewListingCmdHandler
  implements ICommandHandler<CreateListingCommand, ListingResponseDTO>
{
  constructor(
    private readonly repository: IListingRepository,
    private readonly farmingRpc: IFarmingRpc,
  ) {}

  async execute(command: CreateListingCommand): Promise<ListingResponseDTO> {
    const { farmerId, dto } = command;

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
        .withCode("FORBIDDEN")
        .withLog(
          `JWT sub ${farmerId} does not match snapshot farmerId ${snapshot.farmerId}`,
        );
    }

    // 4. Validate snapshot completeness (BR-TS-003)
    if (
      !snapshot.currentSeason?.cropType ||
      snapshot.latitude == null ||
      snapshot.longitude == null ||
      !snapshot.currentSeason?.expectedYield
    ) {
      throw AppError.from(ErrSnapshotIncomplete, 409).withCode(
        "SNAPSHOT_INCOMPLETE",
      );
    }

    // 5. Build listing entity — map Farming fields to Trading fields (BA-SOA §7)
    const now = new Date();
    const listing: Listing = {
      listingId: v7(),
      farmerId,
      plotId: validatedDto.plotId,
      cropSeasonId: validatedDto.cropSeasonId,
      seedType: snapshot.currentSeason.cropType,
      estimatedYield: snapshot.currentSeason.expectedYield,
      area: snapshot.area,
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      expectedPrice: validatedDto.expectedPrice,
      status: ListingStatus.OPEN,
      winningContractId: null,
      winningPaymentTrackingId: null,
      createdAt: now,
      updatedAt: now,
    };

    // 6. Persist
    await this.repository.insert(listing);

    // 7. Return response DTO (BA-SOA §7 Response 201)
    return toListingResponseDTO(listing);
  }
}

