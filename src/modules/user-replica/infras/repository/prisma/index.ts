import { PrismaClient } from "@prisma/client";
import { IUserReplicaRepository } from "@modules/user-replica/interface";
import {
  FarmerReplica,
  TraderReplica,
  UpsertUserReplicaDTO,
} from "@modules/user-replica/model";

export class PrismaUserReplicaRepository implements IUserReplicaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertFarmer(data: UpsertUserReplicaDTO): Promise<boolean> {
    const existing = await this.prisma.farmerReplica.findUnique({
      where: { accountId: data.accountId },
      select: { profileVersion: true },
    });

    const newVersion = BigInt(data.profileVersion);

    // Out-of-order protection: skip if existing version >= incoming version (BA-SOA §9)
    if (existing && BigInt(existing.profileVersion) >= newVersion) {
      return false;
    }

    const joinedAt =
      typeof data.joinedAt === "string"
        ? new Date(data.joinedAt)
        : data.joinedAt;
    const publicVisible = data.publicVisible ?? true;

    await this.prisma.farmerReplica.upsert({
      where: { accountId: data.accountId },
      create: {
        accountId: data.accountId,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl ?? null,
        province: data.province ?? null,
        district: data.district ?? null,
        joinedAt,
        profileVersion: newVersion,
        publicVisible,
      },
      update: {
        displayName: data.displayName,
        avatarUrl: data.avatarUrl ?? null,
        province: data.province ?? null,
        district: data.district ?? null,
        joinedAt,
        profileVersion: newVersion,
        publicVisible,
      },
    });

    return true;
  }

  async upsertTrader(data: UpsertUserReplicaDTO): Promise<boolean> {
    const existing = await this.prisma.traderReplica.findUnique({
      where: { accountId: data.accountId },
      select: { profileVersion: true },
    });

    const newVersion = BigInt(data.profileVersion);

    // Out-of-order protection: skip if existing version >= incoming version (BA-SOA §9)
    if (existing && BigInt(existing.profileVersion) >= newVersion) {
      return false;
    }

    const joinedAt =
      typeof data.joinedAt === "string"
        ? new Date(data.joinedAt)
        : data.joinedAt;
    const publicVisible = data.publicVisible ?? true;

    await this.prisma.traderReplica.upsert({
      where: { accountId: data.accountId },
      create: {
        accountId: data.accountId,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl ?? null,
        province: data.province ?? null,
        district: data.district ?? null,
        joinedAt,
        profileVersion: newVersion,
        publicVisible,
      },
      update: {
        displayName: data.displayName,
        avatarUrl: data.avatarUrl ?? null,
        province: data.province ?? null,
        district: data.district ?? null,
        joinedAt,
        profileVersion: newVersion,
        publicVisible,
      },
    });

    return true;
  }

  async getFarmer(accountId: string): Promise<FarmerReplica | null> {
    const row = await this.prisma.farmerReplica.findUnique({
      where: { accountId },
    });
    if (!row) return null;
    return {
      accountId: row.accountId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      province: row.province,
      district: row.district,
      joinedAt: row.joinedAt,
      profileVersion: row.profileVersion,
      publicVisible: row.publicVisible,
      updatedAt: row.updatedAt,
    };
  }

  async getTrader(accountId: string): Promise<TraderReplica | null> {
    const row = await this.prisma.traderReplica.findUnique({
      where: { accountId },
    });
    if (!row) return null;
    return {
      accountId: row.accountId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      province: row.province,
      district: row.district,
      joinedAt: row.joinedAt,
      profileVersion: row.profileVersion,
      publicVisible: row.publicVisible,
      updatedAt: row.updatedAt,
    };
  }
}

