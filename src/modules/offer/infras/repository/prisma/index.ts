import {
  PrismaClient,
  Offer as PrismaOffer,
  OfferStatus as PrismaOfferStatus,
} from "@prisma/client";
import { PagingDTO } from "@share/model/paging";
import { IOfferRepository } from "@modules/offer/interface";
import {
  Offer,
  OfferCondDTO,
  OfferStatus,
} from "@modules/offer/model";

/**
 * Prisma-based Offer repository.
 * Implements IOfferRepository port.
 */
export class PrismaOfferRepository implements IOfferRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(offer: Offer, tx?: any): Promise<void> {
    const db = tx ?? this.prisma;
    await db.offer.create({
      data: {
        offerId: offer.offerId,
        listingId: offer.listingId,
        farmerId: offer.farmerId,
        traderId: offer.traderId,
        depositAmount: offer.depositAmount,
        status: offer.status as PrismaOfferStatus,
      },
    });
  }

  async getById(offerId: string): Promise<Offer | null> {
    const row = await this.prisma.offer.findUnique({
      where: { offerId },
    });

    if (!row) return null;
    return this.toDomain(row);
  }

  async updateStatus(
    offerId: string,
    status: OfferStatus,
    tx?: any,
  ): Promise<boolean> {
    const db = tx ?? this.prisma;
    const result = await db.offer.updateMany({
      where: { offerId },
      data: {
        status: status as PrismaOfferStatus,
        updatedAt: new Date(),
      },
    });

    return result.count > 0;
  }

  async updateDepositAmount(
    offerId: string,
    depositAmount: string,
    tx?: any,
  ): Promise<boolean> {
    const db = tx ?? this.prisma;
    const result = await db.offer.updateMany({
      where: { offerId },
      data: {
        depositAmount,
        updatedAt: new Date(),
      },
    });

    return result.count > 0;
  }

  async runTransaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
    return await this.prisma.$transaction(work);
  }

  async list(
    cond: OfferCondDTO,
    paging: PagingDTO,
  ): Promise<{ items: Offer[]; total: number }> {
    const where: any = {};

    if (cond.listingId) where.listingId = cond.listingId;
    if (cond.farmerId) where.farmerId = cond.farmerId;
    if (cond.traderId) where.traderId = cond.traderId;
    if (cond.status) where.status = cond.status as PrismaOfferStatus;

    const [rows, total] = await Promise.all([
      this.prisma.offer.findMany({
        where,
        skip: paging.page * paging.size,
        take: paging.size,
        orderBy: [
          { createdAt: "desc" },
          { offerId: "desc" },
        ],
      }),
      this.prisma.offer.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toDomain(r)),
      total,
    };
  }

  // ─── Mapping ──────────────────────────────────────────

  private toDomain(row: PrismaOffer): Offer {
    return {
      offerId: row.offerId,
      listingId: row.listingId,
      farmerId: row.farmerId,
      traderId: row.traderId,
      depositAmount: row.depositAmount.toString(),
      status: row.status as OfferStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

