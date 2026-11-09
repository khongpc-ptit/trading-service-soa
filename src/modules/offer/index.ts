import { PrismaClient } from "@prisma/client";
import { ServiceContext } from "@share/interface/service-context";
import { Router } from "express";
import { PrismaListingRepository } from "@modules/listing/infras/repository/prisma";
import { PrismaOfferRepository } from "./infras/repository/prisma";
import { OfferHTTPService, setupOfferRoutes } from "./infras/transport";
import {
  AcceptOfferCmdHandler,
  CreateOfferCmdHandler,
  GetOfferDetailQueryHandler,
  ListOfferQueryHandler,
} from "./usecase";

/**
 * Offer hexagon composition root.
 * Follows sample/brand setupBrandHexagon pattern:
 *   1. Create infrastructure adapters (repo)
 *   2. Instantiate individual Command & Query handlers
 *   3. Inject handlers into HTTP service
 *   4. Wire routes
 *   5. Return router
 */
export const setupOfferHexagon = (
  prisma: PrismaClient,
  sctx: ServiceContext,
): Router => {
  // Infrastructure adapters
  const offerRepository = new PrismaOfferRepository(prisma);
  const listingRepository = new PrismaListingRepository(prisma);

  // Command & Query handlers (following sample/brand)
  const createCmdHandler = new CreateOfferCmdHandler(
    offerRepository,
    listingRepository,
  );
  const acceptCmdHandler = new AcceptOfferCmdHandler(
    offerRepository,
    listingRepository,
  );
  const getDetailQueryHandler = new GetOfferDetailQueryHandler(
    offerRepository,
  );
  const listQueryHandler = new ListOfferQueryHandler(offerRepository);

  // Transport adapter
  const httpService = new OfferHTTPService(
    createCmdHandler,
    acceptCmdHandler,
    getDetailQueryHandler,
    listQueryHandler,
  );

  // Wire routes and return router
  return setupOfferRoutes(httpService, sctx.mdlFactory);
};

