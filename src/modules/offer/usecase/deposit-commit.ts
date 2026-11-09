import { AppError, ErrInvalidRequest } from "@share/app-error";
import { ICommandHandler } from "@share/interface";
import { IListingRepository } from "@modules/listing/interface";
import {
  DepositCommitResult,
  ListingStatus,
} from "@modules/listing/model";
import { ErrListingAlreadyCommitted } from "@modules/listing/model/error";
import {
  DepositCommitCommand,
  IOfferRepository,
} from "../interface";
import {
  DepositCommitDTOSchema,
  OfferStatus,
} from "../model";
import {
  ErrOfferNotAccepted,
  ErrOfferNotFound,
} from "../model/error";

/**
 * Deposit-commit command handler (BA-SOA §6).
 * Follows sample/brand CQRS pattern: implements ICommandHandler<DepositCommitCommand, DepositCommitResult>.
 *
 * Rules:
 * - Payment service calls using dedicated X-Service-Key.
 * - Idempotency-Key header must match paymentTrackingId in body (if provided).
 * - Trading derives listingId from offerId — not from client input (BR-TS-011).
 * - Offer must exist and be in ACCEPTED status.
 * - Exclusive lock on Listing row via SELECT FOR UPDATE (BR-TS-005).
 * - Idempotent return if the same paymentTrackingId already committed.
 * - Throws 409 LISTING_ALREADY_COMMITTED if a different key already won.
 * - Atomically transitions Listing to LOCKED (BR-TS-007).
 */
export class DepositCommitCmdHandler
  implements ICommandHandler<DepositCommitCommand, DepositCommitResult>
{
  constructor(
    private readonly offerRepository: IOfferRepository,
    private readonly listingRepository: IListingRepository,
  ) {}

  async execute(command: DepositCommitCommand): Promise<DepositCommitResult> {
    const { offerId, idempotencyKey, dto } = command;

    // Validate body DTO
    const validatedDTO = DepositCommitDTOSchema.parse(dto);

    // Validate Idempotency-Key header against body trackingId
    if (idempotencyKey && idempotencyKey !== validatedDTO.paymentTrackingId) {
      throw AppError.from(ErrInvalidRequest, 400)
        .withCode("VALIDATION_ERROR")
        .withLog("Idempotency-Key header does not match paymentTrackingId in body");
    }

    // Check offer exists
    const offer = await this.offerRepository.getById(offerId);
    if (!offer) {
      throw AppError.from(ErrOfferNotFound, 404).withCode("OFFER_NOT_FOUND");
    }

    // Check offer is in ACCEPTED status (BA-SOA §6)
    if (offer.status !== OfferStatus.ACCEPTED) {
      throw AppError.from(ErrOfferNotAccepted, 409)
        .withCode("OFFER_NOT_ACCEPTED")
        .withLog("Offer must be in ACCEPTED status before committing deposit");
    }

    // Atomic exclusive lock on listing
    const result = await this.listingRepository.tryCommitDeposit(
      offerId,
      validatedDTO.contractId,
      validatedDTO.paymentTrackingId,
      validatedDTO.depositAmount,
    );

    if (result === "already_committed") {
      throw AppError.from(ErrListingAlreadyCommitted, 409)
        .withCode("LISTING_ALREADY_COMMITTED")
        .withLog("Another trader has already committed a deposit for this listing");
    }

    return result;
  }
}

