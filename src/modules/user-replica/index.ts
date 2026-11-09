import { PrismaClient } from "@prisma/client";
import { PrismaUserReplicaRepository } from "./infras/repository/prisma";
import { UserReplicaUseCase } from "./usecase";
import { IUserReplicaRepository, IUserReplicaUseCase } from "./interface";

export * from "./model";
export * from "./interface";
export * from "./usecase";
export * from "./infras/repository/prisma";

export interface UserReplicaHexagon {
  repository: IUserReplicaRepository;
  useCase: IUserReplicaUseCase;
}

export function setupUserReplicaHexagon(
  prisma: PrismaClient,
): UserReplicaHexagon {
  const repository = new PrismaUserReplicaRepository(prisma);
  const useCase = new UserReplicaUseCase(repository);
  return { repository, useCase };
}

