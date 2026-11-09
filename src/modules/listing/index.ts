import { PrismaClient } from "@prisma/client";
import { ServiceContext } from "@share/interface/service-context";
import { Router } from "express";
import { PrismaListingRepository } from "./infras/repository/prisma";
import { FarmingRpcClient } from "./infras/rpc/farming.rpc";
import { ListingHTTPService, setupListingRoutes } from "./infras/transport";
import {
  CreateNewListingCmdHandler,
  GetListingDetailQueryHandler,
  ListListingQueryHandler,
} from "./usecase";

/**
 * Listing hexagon composition root.
 * Follows sample/brand setupBrandHexagon pattern:
 *   1. Create infrastructure adapters (repo, rpc)
 *   2. Instantiate individual Command & Query handlers
 *   3. Inject handlers into HTTP service
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

  // Command & Query handlers (following sample/brand)
  const createCmdHandler = new CreateNewListingCmdHandler(
    repository,
    farmingRpc,
  );
  const getDetailQueryHandler = new GetListingDetailQueryHandler(repository);
  const listQueryHandler = new ListListingQueryHandler(repository);

  // Transport adapter
  const httpService = new ListingHTTPService(
    createCmdHandler,
    getDetailQueryHandler,
    listQueryHandler,
  );

  // Wire routes and return router
  return setupListingRoutes(httpService, sctx.mdlFactory);
};
