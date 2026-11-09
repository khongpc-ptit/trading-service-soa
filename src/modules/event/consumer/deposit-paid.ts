import {
  DepositPaidEventData,
  EVENT_DEPOSIT_PAID,
  EventEnvelope,
} from "@share/event";
import { IOfferRepository } from "@modules/offer/interface";
import { IListingRepository } from "@modules/listing/interface";
import { OfferStatus } from "@modules/offer/model";

/**
 * DEPOSIT_PAID Kafka consumer handler (BA-SOA §8, §10, BR-TS-010).
 * Updates Offer.depositAmount upon confirmed deposit payment event from Payment service.
 */
export class DepositPaidConsumerHandler {
  constructor(
    private readonly offerRepository: IOfferRepository,
    private readonly listingRepository: IListingRepository,
  ) {}

  async handle(envelope: EventEnvelope<DepositPaidEventData>): Promise<boolean> {
    if (envelope.eventType !== EVENT_DEPOSIT_PAID) {
      return false;
    }

    const { data } = envelope;
    if (!data) return false;

    // Convert amount to decimal string (e.g. "200000.00")
    const amountStr =
      typeof data.amount === "number"
        ? data.amount.toFixed(2)
        : String(data.amount);

    let targetOfferId = data.offerId;

    // If offerId is not directly in event data, resolve via contractId -> listing -> winning offer
    if (!targetOfferId && data.contractId) {
      const listing = this.listingRepository.getByContractId
        ? await this.listingRepository.getByContractId(data.contractId)
        : null;
      if (listing) {
        const offers = await this.offerRepository.list(
          {
            listingId: listing.listingId,
            status: OfferStatus.ACCEPTED,
          },
          { page: 0, size: 1 },
        );
        if (offers.items.length > 0) {
          targetOfferId = offers.items[0].offerId;
        }
      }
    }

    if (!targetOfferId) {
      console.warn(
        `[deposit-paid-consumer] Could not resolve offer for contractId: ${data.contractId}, depositId: ${data.depositId}`,
      );
      return false;
    }

    const updated = await this.offerRepository.updateDepositAmount(
      targetOfferId,
      amountStr,
    );

    if (updated) {
      console.log(
        `[deposit-paid-consumer] Updated depositAmount=${amountStr} for offer ${targetOfferId}`,
      );
    }

    return updated;
  }
}
