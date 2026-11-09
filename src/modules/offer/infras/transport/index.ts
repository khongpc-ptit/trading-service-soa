import { NextFunction, Request, Response, Router } from "express";
import { AppError, ErrInvalidRequest } from "@share/app-error";
import {
  ICommandHandler,
  IQueryHandler,
  Requester,
  UserRole,
} from "@share/interface";
import { MdlFactory } from "@share/interface/service-context";
import { PagingDTOSchema, PagingResponse } from "@share/model/paging";
import {
  sendCreated,
  sendOk,
  sendPagingResponse,
} from "@share/transport/http-server";
import {
  AcceptOfferCommand,
  CreateOfferCommand,
  GetOfferDetailQuery,
  ListOfferQuery,
} from "@modules/offer/interface";
import {
  OfferCondDTOSchema,
  OfferResponseDTO,
} from "@modules/offer/model";

/**
 * Offer HTTP transport (adapter).
 * Follows sample/brand CQRS pattern: handlers injected individually.
 * Controller contains NO business logic (RULE-008).
 */
export class OfferHTTPService {
  constructor(
    private readonly createCmdHandler: ICommandHandler<
      CreateOfferCommand,
      OfferResponseDTO
    >,
    private readonly acceptCmdHandler: ICommandHandler<
      AcceptOfferCommand,
      OfferResponseDTO
    >,
    private readonly getDetailQueryHandler: IQueryHandler<
      GetOfferDetailQuery,
      OfferResponseDTO
    >,
    private readonly listQueryHandler: IQueryHandler<
      ListOfferQuery,
      PagingResponse<OfferResponseDTO>
    >,
  ) {}

  /**
   * POST /api/v1/offers
   * Auth: Bearer JWT, Role: TRADER
   */
  async createOfferAPI(req: Request, res: Response, next: NextFunction) {
    try {
      const requester = res.locals.requester as Requester;
      const cmd: CreateOfferCommand = {
        traderId: requester.sub,
        dto: req.body,
      };
      const result = await this.createCmdHandler.execute(cmd);
      sendCreated(res, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/offers/:offerId/accept
   * Auth: Bearer JWT, Role: FARMER (listing owner)
   */
  async acceptOfferAPI(req: Request, res: Response, next: NextFunction) {
    try {
      const requester = res.locals.requester as Requester;
      const offerId = Array.isArray(req.params.offerId)
        ? req.params.offerId[0]
        : req.params.offerId;
      if (!offerId) {
        throw AppError.from(ErrInvalidRequest, 400)
          .withCode("VALIDATION_ERROR")
          .withLog("offerId is required");
      }

      const cmd: AcceptOfferCommand = {
        farmerId: requester.sub,
        offerId,
      };
      const result = await this.acceptCmdHandler.execute(cmd);
      sendOk(res, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/offers/:offerId
   * Auth: Bearer JWT, Participant only (Farmer or Trader of the offer, or ADMIN)
   */
  async getOfferAPI(req: Request, res: Response, next: NextFunction) {
    try {
      const requester = res.locals.requester as Requester;
      const offerId = Array.isArray(req.params.offerId)
        ? req.params.offerId[0]
        : req.params.offerId;
      if (!offerId) {
        throw AppError.from(ErrInvalidRequest, 400)
          .withCode("VALIDATION_ERROR")
          .withLog("offerId is required");
      }

      const result = await this.getDetailQueryHandler.query({
        offerId,
        requesterId: requester.sub,
        requesterRole: requester.role,
      });
      sendOk(res, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/offers
   * Auth: Bearer JWT
   */
  async listOffersAPI(req: Request, res: Response, next: NextFunction) {
    try {
      const requester = res.locals.requester as Requester;

      // Parse paging
      const pagingResult = PagingDTOSchema.safeParse(req.query);
      if (!pagingResult.success) {
        throw AppError.from(ErrInvalidRequest, 400)
          .withCode("VALIDATION_ERROR")
          .withLog("Invalid paging parameters");
      }

      // Parse filter conditions
      const condResult = OfferCondDTOSchema.safeParse(req.query);
      const cond = condResult.success ? condResult.data : {};

      const result = await this.listQueryHandler.query({
        cond,
        paging: pagingResult.data,
        requesterId: requester.sub,
        requesterRole: requester.role,
      });
      sendPagingResponse(res, result);
    } catch (error) {
      next(error);
    }
  }
}

/**
 * Wire offer routes — follows sample's setupXxxHexagon pattern.
 */
export function setupOfferRoutes(
  httpService: OfferHTTPService,
  mdlFactory: MdlFactory,
): Router {
  const router = Router();

  const traderOnly = mdlFactory.allowRoles([UserRole.TRADER]);
  const farmerOnly = mdlFactory.allowRoles([UserRole.FARMER]);

  // POST /api/v1/offers — TRADER only
  router.post(
    "/offers",
    mdlFactory.auth,
    traderOnly,
    httpService.createOfferAPI.bind(httpService),
  );

  // POST /api/v1/offers/:offerId/accept — FARMER only
  router.post(
    "/offers/:offerId/accept",
    mdlFactory.auth,
    farmerOnly,
    httpService.acceptOfferAPI.bind(httpService),
  );

  // GET /api/v1/offers/:offerId — Participants only
  router.get(
    "/offers/:offerId",
    mdlFactory.auth,
    httpService.getOfferAPI.bind(httpService),
  );

  // GET /api/v1/offers — Authenticated users (scoped)
  router.get(
    "/offers",
    mdlFactory.auth,
    httpService.listOffersAPI.bind(httpService),
  );

  return router;
}

