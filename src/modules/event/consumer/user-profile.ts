import {
  EVENT_USER_PROFILE_UPDATED,
  EventEnvelope,
  UserProfileUpdatedEventData,
} from "@share/event";
import { IUserReplicaUseCase } from "@modules/user-replica/interface";

/**
 * USER_PROFILE_UPDATED Kafka consumer handler (BA-SOA §9).
 * Synchronizes user replicas into Trading database.
 */
export class UserProfileUpdatedConsumerHandler {
  constructor(private readonly userReplicaUseCase: IUserReplicaUseCase) {}

  async handle(
    envelope: EventEnvelope<UserProfileUpdatedEventData>,
  ): Promise<boolean> {
    if (envelope.eventType !== EVENT_USER_PROFILE_UPDATED) {
      return false;
    }

    const { data } = envelope;
    if (!data || !data.accountId) return false;

    const synced = await this.userReplicaUseCase.syncProfile(data);
    if (synced) {
      console.log(
        `[user-profile-consumer] Synced replica for account ${data.accountId} (role: ${data.role}, version: ${data.profileVersion})`,
      );
    }

    return synced;
  }
}

