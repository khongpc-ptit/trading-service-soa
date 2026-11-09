import { IQueryHandler } from "@share/interface";
import { PagingResponse } from "@share/model/paging";
import {
  IListingRepository,
  ListListingQuery,
} from "../interface";
import {
  ListingCondDTOSchema,
  ListingResponseDTO,
  toListingResponseDTO,
} from "../model";

/**
 * List listings query handler.
 * Follows sample/brand CQRS usecase pattern: implements IQueryHandler<ListListingQuery, PagingResponse<ListingResponseDTO>>.
 */
export class ListListingQueryHandler
  implements IQueryHandler<ListListingQuery, PagingResponse<ListingResponseDTO>>
{
  constructor(private readonly repository: IListingRepository) {}

  async query(
    query: ListListingQuery,
  ): Promise<PagingResponse<ListingResponseDTO>> {
    const validatedCond = ListingCondDTOSchema.parse(query.cond);

    const { items, total } = await this.repository.list(
      validatedCond,
      query.paging,
    );

    return {
      items: items.map(toListingResponseDTO),
      page: query.paging.page,
      size: query.paging.size,
      totalElements: total,
      totalPages: Math.ceil(total / query.paging.size),
    };
  }
}

