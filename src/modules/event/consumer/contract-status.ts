import {
  ContractStatusChangedEventData,
  EVENT_CONTRACT_STATUS_CHANGED,
  EventEnvelope,
} from "@share/event";
import { IListingRepository } from "@modules/listing/interface";

/**
 * CONTRACT_STATUS_CHANGED Kafka consumer handler (BA-SOA §8, BR-TS-008, BR-TS-009).
 * When contract reaches status COMPLETED: transitions the winning listing from LOCKED to SOLD.
 * Other statuses (ACTIVE, CANCELLED) or late events do not modify or rollback state.
 */
export class ContractStatusChangedConsumerHandler {
  constructor(private readonly listingRepository: IListingRepository) {}

  async handle(
    envelope: EventEnvelope<ContractStatusChangedEventData>,
  ): Promise<boolean> {
    if (envelope.eventType !== EVENT_CONTRACT_STATUS_CHANGED) {
      return false;
    }

    const { data } = envelope;
    if (!data || !data.contractId) return false;

    // Only COMPLETED status triggers transition to SOLD (BA-SOA line 1065, BR-TS-008)
    const upperStatus = (data.status || "").toUpperCase();
    if (upperStatus !== "COMPLETED") {
      return false;
    }

    // Atomically transition matching LOCKED listing to SOLD
    if (this.listingRepository.markSoldByContractId) {
      const marked = await this.listingRepository.markSoldByContractId(
        data.contractId,
      );

      if (marked) {
        console.log(
          `[contract-status-consumer] Listing for contract ${data.contractId} marked as SOLD`,
        );
      } else {
        console.log(
          `[contract-status-consumer] No LOCKED listing found matching winningContractId ${data.contractId} (already SOLD or not winner)`,
        );
      }

      return marked;
    }

    return false;
  }
}
