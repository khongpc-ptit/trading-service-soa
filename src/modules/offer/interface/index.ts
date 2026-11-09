import { PagingDTO, PagingResponse } from "@share/model/paging";
import { DepositCommitResult } from "@modules/listing/model";
import {
  CreateOfferDTO,
  DepositCommitDTO,
  Offer,
  OfferCondDTO,
  OfferResponseDTO,
  OfferStatus,
} from "../model";

// ─── Repository Port ────────────────────────────────────

export interface IOfferRepository {
  insert(offer: Offer, tx?: any): Promise<void>;
  getById(offerId: string): Promise<Offer | null>;
  updateStatus(offerId: string, status: OfferStatus, tx?: any): Promise<boolean>;
  updateDepositAmount(offerId: string, depositAmount: string, tx?: any): Promise<boolean>;
  list(
    cond: OfferCondDTO,
    paging: PagingDTO,
  ): Promise<{ items: Offer[]; total: number }>;
  runTransaction<T>(work: (tx: any) => Promise<T>): Promise<T>;
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

export interface DepositCommitCommand {
  offerId: string;
  idempotencyKey?: string;
  dto: DepositCommitDTO;
}

export interface GetDepositCommitQuery {
  offerId: string;
  contractId: string;
  paymentTrackingId: string;
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

  depositCommit(
    offerId: string,
    dto: DepositCommitDTO,
    idempotencyKey?: string,
  ): Promise<DepositCommitResult>;

  getDepositCommit(
    offerId: string,
    contractId: string,
    paymentTrackingId: string,
  ): Promise<DepositCommitResult>;
}

