import { PrismaClient } from "@prisma/client";
import { ServiceContext } from "@share/interface/service-context";
import { Router } from "express";
import { PrismaListingRepository } from "./infras/repository/prisma";
import { FarmingRpcClient } from "./infras/rpc/farming.rpc";
import { ListingHTTPService, setupListingRoutes } from "./infras/transport";
import { ListingUseCase } from "./usecase";

/**
 * Listing hexagon composition root.
 * Follows sample's setupXxxHexagon(db, sctx) pattern:
 *   1. Create infrastructure adapters (repo, rpc)
 *   2. Inject into use case
 *   3. Inject use case into HTTP service
 *   4. Wire routes
 *   5. Return router
 */
export const setupListingHexagon = (
  prisma: PrismaClient,
  sctx: ServiceContext,
): Router => {
  // Infrastructure adapters
  const repository = new PrismaListingRepository(prisma);
  const farmingRpc = new FarmingRpcClient();

  // Application layer
  const useCase = new ListingUseCase(repository, farmingRpc);

  // Transport adapter
  const httpService = new ListingHTTPService(useCase);

  // Wire routes and return router
  return setupListingRoutes(httpService, sctx.mdlFactory);
};
