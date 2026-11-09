import { PrismaClient, Listing as PrismaListing, Prisma } from "@prisma/client";
import { PagingDTO } from "@share/model/paging";
import { IListingRepository } from "@modules/listing/interface";
import {
  DepositCommitResult,
  Listing,
  ListingCondDTO,
  ListingStatus,
} from "@modules/listing/model";

interface RawListingRow {
  listing_id: string;
  status: ListingStatus;
  winning_contract_id: string | null;
  winning_payment_tracking_id: string | null;
}

/**
 * Prisma-based listing repository.
 * Replaces sample's Sequelize repository while preserving the port interface.
 */
export class PrismaListingRepository implements IListingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(listing: Listing): Promise<void> {
    await this.prisma.listing.create({
      data: {
        listingId:                listing.listingId,
        farmerId:                 listing.farmerId,
        plotId:                   listing.plotId,
        cropSeasonId:             listing.cropSeasonId,
        seedType:                 listing.seedType,
        estimatedYield:           listing.estimatedYield,
        area:                     listing.area,
        latitude:                 listing.latitude,
        longitude:                listing.longitude,
        expectedPrice:            listing.expectedPrice,
        status:                   listing.status,
        winningContractId:        listing.winningContractId,
        winningPaymentTrackingId: listing.winningPaymentTrackingId,
      },
    });
  }

  async getById(listingId: string): Promise<Listing | null> {
    const row = await this.prisma.listing.findUnique({
      where: { listingId },
    });

    if (!row) return null;
    return this.toDomain(row);
  }

  async list(
    cond: ListingCondDTO,
    paging: PagingDTO,
  ): Promise<{ items: Listing[]; total: number }> {
    const where: any = {};

    if (cond.farmerId) where.farmerId = cond.farmerId;
    if (cond.status) where.status = cond.status;
    if (cond.seedType) where.seedType = { contains: cond.seedType, mode: 'insensitive' };

    const [rows, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        skip: paging.page * paging.size,
        take: paging.size,
        orderBy: [
          { createdAt: 'desc' },
          { listingId: 'desc' },
        ],
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toDomain(r)),
      total,
    };
  }

  /**
   * Atomic exclusive lock for deposit-commit (BA-SOA §6).
   * Uses raw SQL with SELECT FOR UPDATE for row-level locking.
   */
  async tryCommitDeposit(
    offerId: string,
    contractId: string,
    paymentTrackingId: string,
    _depositAmount: string,
  ): Promise<DepositCommitResult | 'already_committed'> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Get offer to find listingId (Trading derives listingId from offerId — BR-TS-011)
      const offer = await tx.offer.findUnique({
        where: { offerId },
        select: { listingId: true },
      });

      if (!offer) throw new Error('Offer not found');

      // 2. Lock listing row with SELECT FOR UPDATE
      const lockedRows = await tx.$queryRaw<RawListingRow[]>`
        SELECT listing_id, status, winning_contract_id, winning_payment_tracking_id
        FROM listings
        WHERE listing_id = ${offer.listingId}::uuid
        FOR UPDATE
      `;

      const listing = lockedRows[0];
      if (!listing) throw new Error('Listing not found');

      // 3. Idempotency: same tracking key already committed?
      if (listing.winning_payment_tracking_id === paymentTrackingId) {
        return {
          offerId,
          listingId: listing.listing_id,
          contractId: listing.winning_contract_id!,
          paymentTrackingId: listing.winning_payment_tracking_id!,
          listingStatus: 'LOCKED' as const,
        };
      }

      // 4. Already committed by a DIFFERENT key?
      if (listing.winning_contract_id !== null) {
        return 'already_committed';
      }

      // 5. Listing must not be SOLD
      if (listing.status === 'SOLD') {
        return 'already_committed';
      }

      // 6. Atomically set winner + LOCKED
      await tx.$executeRaw`
        UPDATE listings SET
          status = 'LOCKED',
          winning_contract_id = ${contractId}::uuid,
          winning_payment_tracking_id = ${paymentTrackingId}::uuid,
          updated_at = NOW()
        WHERE listing_id = ${listing.listing_id}::uuid
      `;

      return {
        offerId,
        listingId: listing.listing_id,
        contractId,
        paymentTrackingId,
        listingStatus: 'LOCKED' as const,
      };
    });
  }

  async getCommitResult(listingId: string): Promise<DepositCommitResult | null> {
    const listing = await this.prisma.listing.findUnique({
      where: { listingId },
      select: {
        listingId: true,
        winningContractId: true,
        winningPaymentTrackingId: true,
        status: true,
      },
    });

    if (!listing || !listing.winningContractId || !listing.winningPaymentTrackingId) {
      return null;
    }

    return {
      offerId: '',  // would need join; caller has offerId
      listingId: listing.listingId,
      contractId: listing.winningContractId,
      paymentTrackingId: listing.winningPaymentTrackingId,
      listingStatus: 'LOCKED' as const,
    };
  }

  /**
   * Kafka consumer: set listing SOLD only if winningContractId matches (BR-TS-008, BR-TS-009).
   */
  async markSold(listingId: string, winningContractId: string): Promise<boolean> {
    const result = await this.prisma.listing.updateMany({
      where: {
        listingId,
        winningContractId,
        status: ListingStatus.LOCKED,
      },
      data: {
        status: ListingStatus.SOLD,
        updatedAt: new Date(),
      },
    });

    return result.count > 0;
  }

  // ─── Mapping ──────────────────────────────────────────

  private toDomain(row: PrismaListing): Listing {
    return {
      listingId:                row.listingId,
      farmerId:                 row.farmerId,
      plotId:                   row.plotId,
      cropSeasonId:             row.cropSeasonId,
      seedType:                 row.seedType,
      estimatedYield:           this.decimalToNumber(row.estimatedYield),
      area:                     this.decimalToNumber(row.area),
      latitude:                 this.decimalToNumber(row.latitude),
      longitude:                this.decimalToNumber(row.longitude),
      expectedPrice:            row.expectedPrice.toString(),
      status:                   row.status as ListingStatus,
      winningContractId:        row.winningContractId,
      winningPaymentTrackingId: row.winningPaymentTrackingId,
      createdAt:                row.createdAt,
      updatedAt:                row.updatedAt,
    };
  }

  private decimalToNumber(val: Prisma.Decimal): number {
    return val.toNumber();
  }
}
