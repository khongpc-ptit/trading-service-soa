import { AppError } from "@share/app-error";
import { IQueryHandler, UserRole } from "@share/interface";
import {
  GetOfferDetailQuery,
  IOfferRepository,
} from "../interface";
import { OfferResponseDTO, toOfferResponseDTO } from "../model";
import { ErrNotParticipant, ErrOfferNotFound } from "../model/error";

/**
 * Get offer detail query handler.
 * Follows sample/brand CQRS pattern: implements IQueryHandler<GetOfferDetailQuery, OfferResponseDTO>.
 *
 * Rules:
 * - Only participants (farmer or trader) or ADMIN can view offer details.
 * - Throws 404 if not found.
 * - Throws 403 if requester is not a participant.
 */
export class GetOfferDetailQueryHandler
  implements IQueryHandler<GetOfferDetailQuery, OfferResponseDTO>
{
  constructor(private readonly repository: IOfferRepository) {}

  async query(query: GetOfferDetailQuery): Promise<OfferResponseDTO> {
    const { offerId, requesterId, requesterRole } = query;

    const offer = await this.repository.getById(offerId);
    if (!offer) {
      throw AppError.from(ErrOfferNotFound, 404).withCode("NOT_FOUND");
    }

    // Participant verification
    const isParticipant =
      offer.farmerId === requesterId || offer.traderId === requesterId;
    const isAdmin = requesterRole === UserRole.ADMIN;

    if (!isParticipant && !isAdmin) {
      throw AppError.from(ErrNotParticipant, 403).withCode("FORBIDDEN");
    }

    return toOfferResponseDTO(offer);
  }
}

