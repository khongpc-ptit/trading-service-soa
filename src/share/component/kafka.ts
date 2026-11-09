import { Kafka, Producer, ProducerConfig } from "kafkajs";
import { config } from "./config";
import { IEventPublisher } from "@share/outbox/interface";

export class KafkaProducerClient implements IEventPublisher {
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private isConnected: boolean = false;

  constructor(producerConfig?: ProducerConfig) {
    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      retry: {
        initialRetryTime: 300,
        retries: 5,
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      ...producerConfig,
    });
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    try {
      await this.producer.connect();
      this.isConnected = true;
      console.log("[kafka] Producer connected successfully.");
    } catch (error) {
      console.error("[kafka] Failed to connect producer:", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.producer.disconnect();
      this.isConnected = false;
      console.log("[kafka] Producer disconnected.");
    } catch (error) {
      console.error("[kafka] Error disconnecting producer:", error);
    }
  }

  async publish(
    topic: string,
    partitionKey: string,
    payload: any,
  ): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    const value =
      typeof payload === "string" ? payload : JSON.stringify(payload);

    await this.producer.send({
      topic,
      messages: [
        {
          key: partitionKey,
          value,
        },
      ],
    });
  }
}

