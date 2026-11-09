import { IEventPublisher, IOutboxRepository } from "./interface";

export class OutboxRelay {
  private isRunning: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;

  constructor(
    private readonly outboxRepository: IOutboxRepository,
    private readonly publisher: IEventPublisher,
    private readonly pollIntervalMs: number = 500,
    private readonly batchSize: number = 50,
  ) {}

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(
      `[outbox-relay] Started relay worker (interval: ${this.pollIntervalMs}ms, batchSize: ${this.batchSize})`,
    );

    const scheduleNext = () => {
      if (!this.isRunning) return;
      this.timer = setTimeout(async () => {
        try {
          await this.publishBatch();
        } catch (error) {
          console.error("[outbox-relay] Error in relay cycle:", error);
        } finally {
          scheduleNext();
        }
      }, this.pollIntervalMs);
    };

    scheduleNext();
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log("[outbox-relay] Stopped relay worker.");
  }

  async publishBatch(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    try {
      const records = await this.outboxRepository.getUnpublished(
        this.batchSize,
      );
      if (records.length === 0) return 0;

      const publishedIds: string[] = [];

      for (const record of records) {
        try {
          await this.publisher.publish(
            record.topic,
            record.partitionKey,
            record.payload,
          );
          publishedIds.push(record.eventId);
        } catch (error) {
          console.error(
            `[outbox-relay] Failed to publish event ${record.eventId} to ${record.topic}:`,
            error,
          );
          // Stop batch to preserve order on the same partition
          break;
        }
      }

      if (publishedIds.length > 0) {
        await this.outboxRepository.markPublished(publishedIds);
      }

      return publishedIds.length;
    } finally {
      this.isProcessing = false;
    }
  }
}

