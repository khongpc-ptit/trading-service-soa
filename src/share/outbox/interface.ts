export interface OutboxEventRecord {
  eventId: string;
  eventType: string;
  topic: string;
  partitionKey: string;
  payload: any;
  publishedAt: Date | null;
  createdAt: Date;
}

export interface InsertOutboxDTO {
  eventId: string;
  eventType: string;
  topic: string;
  partitionKey: string;
  payload: any;
}

export interface IOutboxRepository {
  insert(record: InsertOutboxDTO, tx?: any): Promise<void>;
  getUnpublished(batchSize?: number): Promise<OutboxEventRecord[]>;
  markPublished(eventIds: string[]): Promise<void>;
}

export interface IEventPublisher {
  publish(topic: string, partitionKey: string, payload: any): Promise<void>;
}

