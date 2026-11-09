import { IQueryHandler, UserRole } from "@share/interface";
import { PagingResponse } from "@share/model/paging";
import {
  IOfferRepository,
  ListOfferQuery,
} from "../interface";
import {
  OfferCondDTO,
  OfferCondDTOSchema,
  OfferResponseDTO,
  toOfferResponseDTO,
} from "../model";

/**
 * List offers query handler.
 * Follows sample/brand CQRS pattern: implements IQueryHandler<ListOfferQuery, PagingResponse<OfferResponseDTO>>.
 *
 * Scoping:
 * - ADMIN can view all offers.
 * - Non-admin users are scoped to offers where they are the farmer or trader.
 */
export class ListOfferQueryHandler
  implements IQueryHandler<ListOfferQuery, PagingResponse<OfferResponseDTO>>
{
  constructor(private readonly repository: IOfferRepository) {}

  async query(
    query: ListOfferQuery,
  ): Promise<PagingResponse<OfferResponseDTO>> {
    const { cond, paging, requesterId, requesterRole } = query;
    const validatedCond = OfferCondDTOSchema.parse(cond);

    const scopedCond: OfferCondDTO = { ...validatedCond };

    // Scope non-admin users to their own offers
    if (requesterRole !== UserRole.ADMIN) {
      if (requesterRole === UserRole.FARMER) {
        scopedCond.farmerId = requesterId;
      } else if (requesterRole === UserRole.TRADER) {
        scopedCond.traderId = requesterId;
      }
    }

    const { items, total } = await this.repository.list(scopedCond, paging);

    return {
      items: items.map(toOfferResponseDTO),
      page: paging.page,
      size: paging.size,
      totalElements: total,
      totalPages: Math.ceil(total / paging.size),
    };
  }
}

