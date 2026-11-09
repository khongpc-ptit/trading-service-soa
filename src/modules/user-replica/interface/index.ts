import { FarmerReplica, TraderReplica, UpsertUserReplicaDTO } from "../model";
import { UserProfileUpdatedEventData } from "@share/event";

export interface IUserReplicaRepository {
  upsertFarmer(data: UpsertUserReplicaDTO): Promise<boolean>;
  upsertTrader(data: UpsertUserReplicaDTO): Promise<boolean>;
  getFarmer(accountId: string): Promise<FarmerReplica | null>;
  getTrader(accountId: string): Promise<TraderReplica | null>;
}

export interface IUserReplicaUseCase {
  syncProfile(eventData: UserProfileUpdatedEventData): Promise<boolean>;
}

