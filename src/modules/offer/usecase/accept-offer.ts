import { AppError } from "@share/app-error";
import { ICommandHandler } from "@share/interface";
import {
  createOfferAcceptedEnvelope,
  TOPIC_TRADING_OFFER,
} from "@share/event";
import { IOutboxRepository } from "@share/outbox/interface";
import { IListingRepository } from "@modules/listing/interface";
import { ListingStatus } from "@modules/listing/model";
import {
  AcceptOfferCommand,
  IOfferRepository,
} from "../interface";
import {
  Offer,
  OfferResponseDTO,
  OfferStatus,
  toOfferResponseDTO,
} from "../model";
import {
  ErrListingNotOpen,
  ErrNotListingOwner,
  ErrOfferNotFound,
  ErrOfferNotPending,
} from "../model/error";

/**
 * Accept offer command handler.
 * Follows sample/brand CQRS pattern: implements ICommandHandler<AcceptOfferCommand, OfferResponseDTO>.
 *
 * Rules:
 * - Only the FARMER who owns the listing can accept an offer.
 * - Offer must exist.
 * - If already ACCEPTED, return idempotent result.
 * - If in invalid state, throw error.
 * - Associated listing must not be SOLD.
 * - Status transitions to ACCEPTED.
 * - Atomically inserts OFFER_ACCEPTED event into outbox_events table.
 */
export class AcceptOfferCmdHandler
  implements ICommandHandler<AcceptOfferCommand, OfferResponseDTO>
{
  constructor(
    private readonly offerRepository: IOfferRepository,
    private readonly listingRepository: IListingRepository,
    private readonly outboxRepository?: IOutboxRepository,
  ) {}

  async execute(command: AcceptOfferCommand): Promise<OfferResponseDTO> {
    const { farmerId, offerId } = command;

    // 1. Fetch offer
    const offer = await this.offerRepository.getById(offerId);
    if (!offer) {
      throw AppError.from(ErrOfferNotFound, 404).withCode("NOT_FOUND");
    }

    // 2. Verify caller is the farmer owner
    if (offer.farmerId !== farmerId) {
      throw AppError.from(ErrNotListingOwner, 403).withCode("FORBIDDEN");
    }

    // 3. Idempotency: already accepted (does not re-emit event)
    if (offer.status === OfferStatus.ACCEPTED) {
      return toOfferResponseDTO(offer);
    }

    // 4. Must be PENDING
    if (offer.status !== OfferStatus.PENDING) {
      throw AppError.from(ErrOfferNotPending, 400).withCode(
        "INVALID_STATE_TRANSITION",
      );
    }

    // 5. Verify associated listing is not SOLD
    const listing = await this.listingRepository.getById(offer.listingId);
    if (listing && listing.status === ListingStatus.SOLD) {
      throw AppError.from(ErrListingNotOpen, 409).withCode(
        "LISTING_ALREADY_SOLD",
      );
    }

    const updatedAt = new Date();
    const updatedOffer: Offer = {
      ...offer,
      status: OfferStatus.ACCEPTED,
      updatedAt,
    };

    // 6. Build OFFER_ACCEPTED event envelope (BA-SOA §8 & §10)
    const envelope = createOfferAcceptedEnvelope(updatedOffer);

    // 7. Update status and insert outbox event atomically
    if (this.outboxRepository) {
      await this.offerRepository.runTransaction(async (tx) => {
        await this.offerRepository.updateStatus(
          offerId,
          OfferStatus.ACCEPTED,
          tx,
        );
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
      await this.offerRepository.updateStatus(offerId, OfferStatus.ACCEPTED);
    }

    // 8. Return updated DTO
    return toOfferResponseDTO(updatedOffer);
  }
}

