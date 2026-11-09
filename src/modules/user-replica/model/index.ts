import { z } from "zod";

// ─── Domain Entities (BA-SOA §9) ────────────────────────

export const UserReplicaSchema = z.object({
  accountId: z.string().uuid(),
  displayName: z.string().min(1),
  avatarUrl: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  joinedAt: z.date(),
  profileVersion: z.bigint().or(z.number()),
  publicVisible: z.boolean(),
  updatedAt: z.date(),
});

export type UserReplica = z.infer<typeof UserReplicaSchema>;

export type FarmerReplica = UserReplica;
export type TraderReplica = UserReplica;

// ─── Upsert DTO ─────────────────────────────────────────

export interface UpsertUserReplicaDTO {
  accountId: string;
  displayName: string;
  avatarUrl?: string | null;
  province?: string | null;
  district?: string | null;
  joinedAt: Date | string;
  profileVersion: number | string | bigint;
  publicVisible?: boolean;
}

