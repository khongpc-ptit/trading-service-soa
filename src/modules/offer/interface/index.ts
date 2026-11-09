import { PagingDTO, PagingResponse } from "@share/model/paging";
import {
  CreateOfferDTO,
  Offer,
  OfferCondDTO,
  OfferResponseDTO,
  OfferStatus,
} from "../model";

// ─── Repository Port ────────────────────────────────────

export interface IOfferRepository {
  insert(offer: Offer): Promise<void>;
  getById(offerId: string): Promise<Offer | null>;
  updateStatus(offerId: string, status: OfferStatus): Promise<boolean>;
  updateDepositAmount(offerId: string, depositAmount: string): Promise<boolean>;
  list(
    cond: OfferCondDTO,
    paging: PagingDTO,
  ): Promise<{ items: Offer[]; total: number }>;
}

// ─── CQRS Command & Query Shapes ────────────────────────

export interface CreateOfferCommand {
  traderId: string;
  dto: CreateOfferDTO;
}

export interface AcceptOfferCommand {
  farmerId: string;
  offerId: string;
}

export interface GetOfferDetailQuery {
  offerId: string;
  requesterId: string;
  requesterRole?: string;
}

export interface ListOfferQuery {
  cond: OfferCondDTO;
  paging: PagingDTO;
  requesterId: string;
  requesterRole?: string;
}

// ─── Use-Case Port ──────────────────────────────────────

export interface IOfferUseCase {
  createOffer(
    traderId: string,
    dto: CreateOfferDTO,
  ): Promise<OfferResponseDTO>;

  acceptOffer(
    farmerId: string,
    offerId: string,
  ): Promise<OfferResponseDTO>;

  getOffer(
    offerId: string,
    requesterId: string,
    requesterRole?: string,
  ): Promise<OfferResponseDTO>;

  listOffers(
    cond: OfferCondDTO,
    paging: PagingDTO,
    requesterId: string,
    requesterRole?: string,
  ): Promise<PagingResponse<OfferResponseDTO>>;
}

