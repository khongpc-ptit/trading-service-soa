import { UserProfileUpdatedEventData } from "@share/event";
import {
  IUserReplicaRepository,
  IUserReplicaUseCase,
} from "../interface";

/**
 * UserReplica use case (BA-SOA §9).
 * Synchronizes user profiles from USER_PROFILE_UPDATED Kafka events.
 * Handles FARMER and TRADER profile replication with out-of-order version protection.
 */
export class UserReplicaUseCase implements IUserReplicaUseCase {
  constructor(private readonly repository: IUserReplicaRepository) {}

  async syncProfile(eventData: UserProfileUpdatedEventData): Promise<boolean> {
    const { accountId, role, profileVersion, publicVisible, profile } =
      eventData;

    const dto = {
      accountId,
      displayName: profile?.displayName || "Unknown User",
      avatarUrl: profile?.avatarUrl ?? null,
      province: profile?.province ?? null,
      district: profile?.district ?? null,
      joinedAt: profile?.joinedAt || new Date().toISOString(),
      profileVersion,
      publicVisible: publicVisible ?? true,
    };

    const upperRole = (role || "").toUpperCase();
    if (upperRole === "FARMER") {
      return this.repository.upsertFarmer(dto);
    } else if (upperRole === "TRADER") {
      return this.repository.upsertTrader(dto);
    }

    return false;
  }
}

