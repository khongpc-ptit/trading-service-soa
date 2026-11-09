import { AppError, ErrNotFound } from "@share/app-error";
import { IQueryHandler } from "@share/interface";
import { IListingRepository } from "@modules/listing/interface";
import { DepositCommitResult } from "@modules/listing/model";
import {
  GetDepositCommitQuery,
  IOfferRepository,
} from "../interface";
import { GetDepositCommitQueryDTOSchema } from "../model";
import { ErrOfferNotFound } from "../model/error";

/**
 * Get deposit-commit query handler (BA-SOA §6 Recovery endpoint).
 * Follows sample/brand CQRS pattern: implements IQueryHandler<GetDepositCommitQuery, DepositCommitResult>.
 *
 * Rules:
 * - Caller must provide contractId and paymentTrackingId via query params.
 * - Offer must exist.
 * - Returns 200 with commit result if listing is committed for this tracking/contract.
 * - Returns 404 if no winning commit result exists for this contract and tracking key.
 */
export class GetDepositCommitQueryHandler
  implements IQueryHandler<GetDepositCommitQuery, DepositCommitResult>
{
  constructor(
    private readonly offerRepository: IOfferRepository,
    private readonly listingRepository: IListingRepository,
  ) {}

  async query(query: GetDepositCommitQuery): Promise<DepositCommitResult> {
    const { offerId, contractId, paymentTrackingId } = query;

    // Validate query params
    GetDepositCommitQueryDTOSchema.parse({ contractId, paymentTrackingId });

    // Check offer exists
    const offer = await this.offerRepository.getById(offerId);
    if (!offer) {
      throw AppError.from(ErrOfferNotFound, 404).withCode("OFFER_NOT_FOUND");
    }

    // Read existing commit result
    const commitResult = await this.listingRepository.getCommitResult(
      offer.listingId,
      offerId,
    );

    if (
      !commitResult ||
      commitResult.contractId !== contractId ||
      commitResult.paymentTrackingId !== paymentTrackingId
    ) {
      throw AppError.from(ErrNotFound, 404)
        .withCode("COMMIT_RESULT_NOT_FOUND")
        .withLog("No winning deposit commitment found for this contract and tracking key");
    }

    return commitResult;
  }
}

