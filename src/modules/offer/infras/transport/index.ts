import { Handler, NextFunction, Request, Response, Router } from "express";
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
  DepositCommitCommand,
  GetDepositCommitQuery,
  GetOfferDetailQuery,
  ListOfferQuery,
} from "@modules/offer/interface";
import {
  OfferCondDTOSchema,
  OfferResponseDTO,
} from "@modules/offer/model";
import { DepositCommitResult } from "@modules/listing/model";

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
    private readonly depositCommitCmdHandler?: ICommandHandler<
      DepositCommitCommand,
      DepositCommitResult
    >,
    private readonly getDepositCommitQueryHandler?: IQueryHandler<
      GetDepositCommitQuery,
      DepositCommitResult
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

  /**
   * POST /internal/v1/offers/:offerId/deposit-commit
   * Auth: X-Service-Key (Payment service)
   */
  async depositCommitAPI(req: Request, res: Response, next: NextFunction) {
    try {
      const offerId = Array.isArray(req.params.offerId)
        ? req.params.offerId[0]
        : req.params.offerId;
      if (!offerId) {
        throw AppError.from(ErrInvalidRequest, 400)
          .withCode("VALIDATION_ERROR")
          .withLog("offerId is required");
      }

      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;

      const cmd: DepositCommitCommand = {
        offerId,
        idempotencyKey,
        dto: req.body,
      };

      if (!this.depositCommitCmdHandler) {
        throw new Error("depositCommitCmdHandler not injected");
      }

      const result = await this.depositCommitCmdHandler.execute(cmd);
      sendOk(res, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /internal/v1/offers/:offerId/deposit-commit?contractId=...&paymentTrackingId=...
   * Auth: X-Service-Key (Payment service)
   */
  async getDepositCommitAPI(req: Request, res: Response, next: NextFunction) {
    try {
      const offerId = Array.isArray(req.params.offerId)
        ? req.params.offerId[0]
        : req.params.offerId;
      if (!offerId) {
        throw AppError.from(ErrInvalidRequest, 400)
          .withCode("VALIDATION_ERROR")
          .withLog("offerId is required");
      }

      const contractId = req.query.contractId as string;
      const paymentTrackingId = req.query.paymentTrackingId as string;

      if (!contractId || !paymentTrackingId) {
        throw AppError.from(ErrInvalidRequest, 400)
          .withCode("VALIDATION_ERROR")
          .withLog("contractId and paymentTrackingId query parameters are required");
      }

      if (!this.getDepositCommitQueryHandler) {
        throw new Error("getDepositCommitQueryHandler not injected");
      }

      const result = await this.getDepositCommitQueryHandler.query({
        offerId,
        contractId,
        paymentTrackingId,
      });
      sendOk(res, result);
    } catch (error) {
      next(error);
    }
  }
}

/**
 * Wire internal offer routes (/internal/v1/offers/**) — protected by X-Service-Key.
 */
export function setupInternalOfferRoutes(
  httpService: OfferHTTPService,
  serviceKeyMiddleware: Handler,
): Router {
  const router = Router();

  // POST /offers/:offerId/deposit-commit
  router.post(
    "/offers/:offerId/deposit-commit",
    serviceKeyMiddleware,
    httpService.depositCommitAPI.bind(httpService),
  );

  // GET /offers/:offerId/deposit-commit
  router.get(
    "/offers/:offerId/deposit-commit",
    serviceKeyMiddleware,
    httpService.getDepositCommitAPI.bind(httpService),
  );

  return router;
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

