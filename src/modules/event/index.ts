import { PrismaClient } from "@prisma/client";
import { PrismaOfferRepository } from "@modules/offer/infras/repository/prisma";
import { PrismaListingRepository } from "@modules/listing/infras/repository/prisma";
import { IUserReplicaUseCase } from "@modules/user-replica/interface";
import { DepositPaidConsumerHandler } from "./consumer/deposit-paid";
import { ContractStatusChangedConsumerHandler } from "./consumer/contract-status";
import { UserProfileUpdatedConsumerHandler } from "./consumer/user-profile";
import { KafkaConsumerManager } from "@share/component/kafka-consumer";

export * from "./consumer/deposit-paid";
export * from "./consumer/contract-status";
export * from "./consumer/user-profile";

export interface KafkaConsumersHexagon {
  consumerManager: KafkaConsumerManager;
  depositPaidHandler: DepositPaidConsumerHandler;
  contractStatusHandler: ContractStatusChangedConsumerHandler;
  userProfileHandler: UserProfileUpdatedConsumerHandler;
}

export function setupKafkaConsumersHexagon(
  prisma: PrismaClient,
  userReplicaUseCase: IUserReplicaUseCase,
): KafkaConsumersHexagon {
  const offerRepository = new PrismaOfferRepository(prisma);
  const listingRepository = new PrismaListingRepository(prisma);

  const depositPaidHandler = new DepositPaidConsumerHandler(
    offerRepository,
    listingRepository,
  );
  const contractStatusHandler = new ContractStatusChangedConsumerHandler(
    listingRepository,
  );
  const userProfileHandler = new UserProfileUpdatedConsumerHandler(
    userReplicaUseCase,
  );

  const consumerManager = new KafkaConsumerManager({
    depositPaidHandler,
    contractStatusHandler,
    userProfileHandler,
  });

  return {
    consumerManager,
    depositPaidHandler,
    contractStatusHandler,
    userProfileHandler,
  };
}

