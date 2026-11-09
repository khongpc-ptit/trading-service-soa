import { z } from "zod";

// ─── Offer Status (BA-SOA §5: PENDING → ACCEPTED) ────────

export enum OfferStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
}

// ─── Domain Entity ──────────────────────────────────────

export const OfferSchema = z.object({
  offerId: z.string().uuid(),
  listingId: z.string().uuid(),
  farmerId: z.string().uuid(),
  traderId: z.string().uuid(),
  depositAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a decimal string (e.g. '0.00')"),
  status: z.nativeEnum(OfferStatus),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Offer = z.infer<typeof OfferSchema>;

// ─── Create DTO (Trader input) ──────────────────────────
//   traderId is taken strictly from JWT sub (res.locals.requester)
//   farmerId is derived from the associated Listing

export const CreateOfferDTOSchema = z.object({
  listingId: z.string().uuid({ message: "listingId must be a valid UUID" }),
});

export type CreateOfferDTO = z.infer<typeof CreateOfferDTOSchema>;

// ─── Filter / Condition DTO ─────────────────────────────

export const OfferCondDTOSchema = z.object({
  listingId: z.string().uuid().optional(),
  farmerId: z.string().uuid().optional(),
  traderId: z.string().uuid().optional(),
  status: z.nativeEnum(OfferStatus).optional(),
});

export type OfferCondDTO = z.infer<typeof OfferCondDTOSchema>;

// ─── Response DTO ───────────────────────────────────────

export const OfferResponseDTOSchema = z.object({
  offerId: z.string().uuid(),
  listingId: z.string().uuid(),
  farmerId: z.string().uuid(),
  traderId: z.string().uuid(),
  depositAmount: z.string(),
  status: z.nativeEnum(OfferStatus),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type OfferResponseDTO = z.infer<typeof OfferResponseDTOSchema>;

// ─── Mapper ─────────────────────────────────────────────

export function toOfferResponseDTO(offer: Offer): OfferResponseDTO {
  return {
    offerId: offer.offerId,
    listingId: offer.listingId,
    farmerId: offer.farmerId,
    traderId: offer.traderId,
    depositAmount: offer.depositAmount,
    status: offer.status,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };
}

