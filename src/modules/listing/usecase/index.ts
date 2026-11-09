import { PagingDTO, PagingResponse } from "@share/model/paging";
import {
  CreateListingDTO,
  ListingCondDTO,
  ListingResponseDTO,
} from "../model";
import {
  IFarmingRpc,
  IListingRepository,
  IListingUseCase,
} from "../interface";
import { CreateNewListingCmdHandler } from "./create-new-listing";
import { GetListingDetailQueryHandler } from "./get-listing-detail";
import { ListListingQueryHandler } from "./list-listing";

export * from "./create-new-listing";
export * from "./get-listing-detail";
export * from "./list-listing";

/**
 * Composite Listing Use Case facade.
 * Composes individual Command and Query handlers.
 */
export class ListingUseCase implements IListingUseCase {
  private readonly createCmdHandler: CreateNewListingCmdHandler;
  private readonly getDetailQueryHandler: GetListingDetailQueryHandler;
  private readonly listQueryHandler: ListListingQueryHandler;

  constructor(
    repository: IListingRepository,
    farmingRpc: IFarmingRpc,
  ) {
    this.createCmdHandler = new CreateNewListingCmdHandler(
      repository,
      farmingRpc,
    );
    this.getDetailQueryHandler = new GetListingDetailQueryHandler(repository);
    this.listQueryHandler = new ListListingQueryHandler(repository);
  }

  async createListing(
    farmerId: string,
    dto: CreateListingDTO,
  ): Promise<ListingResponseDTO> {
    return this.createCmdHandler.execute({ farmerId, dto });
  }

  async getListing(listingId: string): Promise<ListingResponseDTO> {
    return this.getDetailQueryHandler.query({ listingId });
  }

  async listListings(
    cond: ListingCondDTO,
    paging: PagingDTO,
  ): Promise<PagingResponse<ListingResponseDTO>> {
    return this.listQueryHandler.query({ cond, paging });
  }
}
