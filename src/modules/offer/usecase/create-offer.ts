import { AppError } from "@share/app-error";
import { ICommandHandler } from "@share/interface";
import {
  createOfferCreatedEnvelope,
  TOPIC_TRADING_OFFER,
} from "@share/event";
import { IOutboxRepository } from "@share/outbox/interface";
import { v7 } from "uuid";
import { IListingRepository } from "@modules/listing/interface";
import { ListingStatus } from "@modules/listing/model";
import { ErrListingNotFound } from "@modules/listing/model/error";
import {
  CreateOfferCommand,
  IOfferRepository,
} from "../interface";
import {
  CreateOfferDTOSchema,
  Offer,
  OfferResponseDTO,
  OfferStatus,
  toOfferResponseDTO,
} from "../model";
import {
  ErrCannotOfferOwnListing,
  ErrListingNotOpen,
} from "../model/error";

/**
 * Create offer command handler.
 * Follows sample/brand CQRS pattern: implements ICommandHandler<CreateOfferCommand, OfferResponseDTO>.
 *
 * Rules:
 * - Only TRADER can make an offer.
 * - Trader ID is derived from JWT sub.
 * - Associated listing must exist and be in OPEN status.
 * - Farmer cannot make an offer on their own listing.
 * - Starts with status: PENDING, depositAmount: "0.00".
 * - Atomically inserts OFFER_CREATED event into outbox_events table.
 */
export class CreateOfferCmdHandler
  implements ICommandHandler<CreateOfferCommand, OfferResponseDTO>
{
  constructor(
    private readonly offerRepository: IOfferRepository,
    private readonly listingRepository: IListingRepository,
    private readonly outboxRepository?: IOutboxRepository,
  ) {}

  async execute(command: CreateOfferCommand): Promise<OfferResponseDTO> {
    const { traderId, dto } = command;

    // 1. Validate input
    const validatedDto = CreateOfferDTOSchema.parse(dto);

    // 2. Fetch associated listing
    const listing = await this.listingRepository.getById(validatedDto.listingId);
    if (!listing) {
      throw AppError.from(ErrListingNotFound, 404).withCode("NOT_FOUND");
    }

    // 3. Verify listing is OPEN
    if (listing.status !== ListingStatus.OPEN) {
      throw AppError.from(ErrListingNotOpen, 409).withCode(
        "LISTING_NOT_OPEN",
      );
    }

    // 4. Verify trader is not the listing owner
    if (listing.farmerId === traderId) {
      throw AppError.from(ErrCannotOfferOwnListing, 400).withCode(
        "VALIDATION_ERROR",
      );
    }

    // 5. Build Offer entity
    const now = new Date();
    const offer: Offer = {
      offerId: v7(),
      listingId: listing.listingId,
      farmerId: listing.farmerId,
      traderId,
      depositAmount: "0.00",
      status: OfferStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    };

    // 6. Build OFFER_CREATED event envelope (BA-SOA §8 & §10)
    const envelope = createOfferCreatedEnvelope(offer);

    // 7. Persist offer and outbox event atomically
    if (this.outboxRepository) {
      await this.offerRepository.runTransaction(async (tx) => {
        await this.offerRepository.insert(offer, tx);
        await this.outboxRepository!.insert(
          {
            eventId: envelope.eventId,
            eventType: envelope.eventType,
            topic: TOPIC_TRADING_OFFER,
            partitionKey: offer.offerId,
            payload: envelope,
          },
          tx,
        );
      });
    } else {
      await this.offerRepository.insert(offer);
    }

    // 8. Return response DTO
    return toOfferResponseDTO(offer);
  }
}

