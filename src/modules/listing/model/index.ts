import { z } from "zod";

// ─── Listing Status (BA-SOA §5: OPEN → LOCKED → SOLD) ──

export enum ListingStatus {
  OPEN   = 'OPEN',
  LOCKED = 'LOCKED',
  SOLD   = 'SOLD',
}

// ─── Domain Entity ──────────────────────────────────────

export const ListingSchema = z.object({
  listingId:                z.string().uuid(),
  farmerId:                 z.string().uuid(),
  plotId:                   z.string().uuid(),
  cropSeasonId:             z.string().uuid(),
  seedType:                 z.string().min(1),
  estimatedYield:           z.number().positive(),
  area:                     z.number().positive(),
  latitude:                 z.number().min(-90).max(90),
  longitude:                z.number().min(-180).max(180),
  expectedPrice:            z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a decimal string (e.g. "4600000.00")'),
  status:                   z.nativeEnum(ListingStatus),
  winningContractId:        z.string().uuid().nullable(),
  winningPaymentTrackingId: z.string().uuid().nullable(),
  createdAt:                z.date(),
  updatedAt:                z.date(),
});

export type Listing = z.infer<typeof ListingSchema>;

// ─── Create DTO (Farmer input — BA-SOA §7) ──────────────
//   farmerId is taken from JWT sub (BR-TS-001)
//   plotId + cropSeasonId → call Farming for snapshot

export const CreateListingDTOSchema = z.object({
  plotId:        z.string().uuid({ message: 'plotId must be a valid UUID' }),
  cropSeasonId:  z.string().uuid({ message: 'cropSeasonId must be a valid UUID' }),
  expectedPrice: z.string().regex(/^\d+(\.\d{1,2})?$/, 'expectedPrice must be a positive decimal string in VND (e.g. "4600000.00")'),
});

export type CreateListingDTO = z.infer<typeof CreateListingDTOSchema>;

// ─── Filter/Condition DTO ────────────────────────────────

export const ListingCondDTOSchema = z.object({
  farmerId:  z.string().uuid().optional(),
  status:    z.nativeEnum(ListingStatus).optional(),
  seedType:  z.string().optional(),
  // GPS proximity for feed sorting
  latitude:  z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export type ListingCondDTO = z.infer<typeof ListingCondDTOSchema>;

// ─── Response DTO (BA-SOA §7 Response 201) ───────────────

export const ListingResponseDTOSchema = z.object({
  listingId:     z.string().uuid(),
  farmerId:      z.string().uuid(),
  plotId:        z.string().uuid(),
  cropSeasonId:  z.string().uuid(),
  seedType:      z.string(),
  estimatedYield: z.number(),
  area:          z.number(),
  latitude:      z.number(),
  longitude:     z.number(),
  expectedPrice: z.string(),
  status:        z.nativeEnum(ListingStatus),
});

export type ListingResponseDTO = z.infer<typeof ListingResponseDTOSchema>;

// ─── Farming snapshot response (BA-SOA §7) ───────────────

export interface FarmingSnapshotDTO {
  plotId: string;
  farmerId: string;
  area: number;
  latitude: number;
  longitude: number;
  currentSeason: {
    cropSeasonId: string;
    cropType: string;
    expectedYield: number;
  };
}

// ─── Deposit-Commit result (BA-SOA §6) ──────────────────

export interface DepositCommitResult {
  offerId: string;
  listingId: string;
  contractId: string;
  paymentTrackingId: string;
  listingStatus: 'LOCKED';
}
