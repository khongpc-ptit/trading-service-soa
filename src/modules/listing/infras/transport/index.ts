import { NextFunction, Request, Response, Router } from "express";
import { AppError, ErrInvalidRequest } from "@share/app-error";
import { Requester, UserRole } from "@share/interface";
import { MdlFactory } from "@share/interface/service-context";
import { PagingDTOSchema } from "@share/model/paging";
import { sendCreated, sendPagingResponse, sendOk } from "@share/transport/http-server";
import { IListingUseCase } from "@modules/listing/interface";
import { ListingCondDTOSchema } from "@modules/listing/model";

/**
 * Listing HTTP transport (adapter).
 * Follows sample's pattern: methods bound to Express routes.
 * Controller contains NO business logic (RULE-008).
 */
export class ListingHTTPService {
  constructor(private readonly useCase: IListingUseCase) {}

  /**
   * POST /api/v1/listings
   * Auth: Bearer JWT, Role: FARMER
   *
   * BA-SOA §7: farmerId from JWT sub, NOT from body (BR-TS-001).
   */
  async createListingAPI(req: Request, res: Response, next: NextFunction) {
    try {
      const requester = res.locals.requester as Requester;
      const result = await this.useCase.createListing(requester.sub, req.body);
      sendCreated(res, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/listings/:listingId
   */
  async getListingAPI(req: Request, res: Response, next: NextFunction) {
    try {
      const listingId = Array.isArray(req.params.listingId) ? req.params.listingId[0] : req.params.listingId;
      if (!listingId) {
        throw AppError.from(ErrInvalidRequest, 400).withCode('VALIDATION_ERROR').withLog('listingId is required');
      }
      const result = await this.useCase.getListing(listingId);
      sendOk(res, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/listings
   * BA-SOA: page=0, size=20, max 100; sort by GPS distance then listingId.
   */
  async listListingsAPI(req: Request, res: Response, next: NextFunction) {
    try {
      // Parse paging
      const pagingResult = PagingDTOSchema.safeParse(req.query);
      if (!pagingResult.success) {
        throw AppError.from(ErrInvalidRequest, 400)
          .withCode('VALIDATION_ERROR')
          .withLog('Invalid paging parameters');
      }

      // Parse filter conditions
      const condResult = ListingCondDTOSchema.safeParse(req.query);
      const cond = condResult.success ? condResult.data : {};

      const result = await this.useCase.listListings(cond, pagingResult.data);
      sendPagingResponse(res, result);
    } catch (error) {
      next(error);
    }
  }
}

/**
 * Wire listing routes — follows sample's setupXxxHexagon pattern.
 */
export function setupListingRoutes(
  httpService: ListingHTTPService,
  mdlFactory: MdlFactory,
): Router {
  const router = Router();

  const farmerOnly = mdlFactory.allowRoles([UserRole.FARMER]);

  // POST /api/v1/listings — FARMER only
  router.post(
    '/listings',
    mdlFactory.auth,
    farmerOnly,
    httpService.createListingAPI.bind(httpService),
  );

  // GET /api/v1/listings — any authenticated user
  router.get(
    '/listings',
    mdlFactory.auth,
    httpService.listListingsAPI.bind(httpService),
  );

  // GET /api/v1/listings/:listingId — any authenticated user
  router.get(
    '/listings/:listingId',
    mdlFactory.auth,
    httpService.getListingAPI.bind(httpService),
  );

  return router;
}
