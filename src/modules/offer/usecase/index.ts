import { PagingDTO, PagingResponse } from "@share/model/paging";
import { IListingRepository } from "@modules/listing/interface";
import { IOutboxRepository } from "@share/outbox/interface";
import {
  CreateOfferDTO,
  OfferCondDTO,
  OfferResponseDTO,
} from "../model";
import {
  IOfferRepository,
  IOfferUseCase,
} from "../interface";
import { CreateOfferCmdHandler } from "./create-offer";
import { AcceptOfferCmdHandler } from "./accept-offer";
import { GetOfferDetailQueryHandler } from "./get-offer-detail";
import { ListOfferQueryHandler } from "./list-offer";

export * from "./create-offer";
export * from "./accept-offer";
export * from "./get-offer-detail";
export * from "./list-offer";

/**
 * Composite Offer Use Case facade.
 * Composes individual Command and Query handlers.
 */
export class OfferUseCase implements IOfferUseCase {
  private readonly createCmdHandler: CreateOfferCmdHandler;
  private readonly acceptCmdHandler: AcceptOfferCmdHandler;
  private readonly getDetailQueryHandler: GetOfferDetailQueryHandler;
  private readonly listQueryHandler: ListOfferQueryHandler;

  constructor(
    offerRepository: IOfferRepository,
    listingRepository: IListingRepository,
    outboxRepository?: IOutboxRepository,
  ) {
    this.createCmdHandler = new CreateOfferCmdHandler(
      offerRepository,
      listingRepository,
      outboxRepository,
    );
    this.acceptCmdHandler = new AcceptOfferCmdHandler(
      offerRepository,
      listingRepository,
      outboxRepository,
    );
    this.getDetailQueryHandler = new GetOfferDetailQueryHandler(
      offerRepository,
    );
    this.listQueryHandler = new ListOfferQueryHandler(offerRepository);
  }

  async createOffer(
    traderId: string,
    dto: CreateOfferDTO,
  ): Promise<OfferResponseDTO> {
    return this.createCmdHandler.execute({ traderId, dto });
  }

  async acceptOffer(
    farmerId: string,
    offerId: string,
  ): Promise<OfferResponseDTO> {
    return this.acceptCmdHandler.execute({ farmerId, offerId });
  }

  async getOffer(
    offerId: string,
    requesterId: string,
    requesterRole?: string,
  ): Promise<OfferResponseDTO> {
    return this.getDetailQueryHandler.query({
      offerId,
      requesterId,
      requesterRole,
    });
  }

  async listOffers(
    cond: OfferCondDTO,
    paging: PagingDTO,
    requesterId: string,
    requesterRole?: string,
  ): Promise<PagingResponse<OfferResponseDTO>> {
    return this.listQueryHandler.query({
      cond,
      paging,
      requesterId,
      requesterRole,
    });
  }
}

