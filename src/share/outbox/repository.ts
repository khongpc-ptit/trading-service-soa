import { PrismaClient } from "@prisma/client";
import {
  IOutboxRepository,
  InsertOutboxDTO,
  OutboxEventRecord,
} from "./interface";

export class PrismaOutboxRepository implements IOutboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(record: InsertOutboxDTO, tx?: any): Promise<void> {
    const db = tx ?? this.prisma;
    await db.outboxEvent.create({
      data: {
        eventId: record.eventId,
        eventType: record.eventType,
        topic: record.topic,
        partitionKey: record.partitionKey,
        payload: record.payload,
      },
    });
  }

  async getUnpublished(batchSize: number = 50): Promise<OutboxEventRecord[]> {
    const rows = await this.prisma.outboxEvent.findMany({
      where: {
        publishedAt: null,
      },
      take: batchSize,
      orderBy: {
        createdAt: "asc",
      },
    });

    return rows.map((row) => ({
      eventId: row.eventId,
      eventType: row.eventType,
      topic: row.topic,
      partitionKey: row.partitionKey,
      payload: row.payload,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
    }));
  }

  async markPublished(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;

    await this.prisma.outboxEvent.updateMany({
      where: {
        eventId: {
          in: eventIds,
        },
      },
      data: {
        publishedAt: new Date(),
      },
    });
  }
}

