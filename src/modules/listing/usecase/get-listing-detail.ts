import { AppError } from "@share/app-error";
import { IQueryHandler } from "@share/interface";
import {
  GetListingDetailQuery,
  IListingRepository,
} from "../interface";
import { ListingResponseDTO, toListingResponseDTO } from "../model";
import { ErrListingNotFound } from "../model/error";

/**
 * Get listing detail query handler.
 * Follows sample/brand CQRS usecase pattern: implements IQueryHandler<GetListingDetailQuery, ListingResponseDTO>.
 */
export class GetListingDetailQueryHandler
  implements IQueryHandler<GetListingDetailQuery, ListingResponseDTO>
{
  constructor(private readonly repository: IListingRepository) {}

  async query(query: GetListingDetailQuery): Promise<ListingResponseDTO> {
    const listing = await this.repository.getById(query.listingId);

    if (!listing) {
      throw AppError.from(ErrListingNotFound, 404).withCode("NOT_FOUND");
    }

    return toListingResponseDTO(listing);
  }
}

