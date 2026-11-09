import { Consumer, Kafka } from "kafkajs";
import { config } from "./config";
import {
  GROUP_TRADING_CONTRACT,
  GROUP_TRADING_DEPOSIT,
  GROUP_TRADING_USER_PROFILE,
  TOPIC_CONTRACT_LIFECYCLE,
  TOPIC_PAYMENT_DEPOSIT,
  TOPIC_USER_PROFILE,
} from "@share/event";
import { DepositPaidConsumerHandler } from "@modules/event/consumer/deposit-paid";
import { ContractStatusChangedConsumerHandler } from "@modules/event/consumer/contract-status";
import { UserProfileUpdatedConsumerHandler } from "@modules/event/consumer/user-profile";

export interface ConsumerHandlers {
  depositPaidHandler: DepositPaidConsumerHandler;
  contractStatusHandler: ContractStatusChangedConsumerHandler;
  userProfileHandler: UserProfileUpdatedConsumerHandler;
}

export class KafkaConsumerManager {
  private readonly kafka: Kafka;
  private readonly consumers: Consumer[] = [];
  private isRunning: boolean = false;

  constructor(private readonly handlers: ConsumerHandlers) {
    this.kafka = new Kafka({
      clientId: `${config.kafka.clientId}-consumer`,
      brokers: config.kafka.brokers,
      retry: {
        initialRetryTime: 300,
        retries: 5,
      },
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // 1. Consumer: DEPOSIT_PAID
      const depositConsumer = this.kafka.consumer({
        groupId: GROUP_TRADING_DEPOSIT,
      });
      await depositConsumer.connect();
      await depositConsumer.subscribe({
        topic: TOPIC_PAYMENT_DEPOSIT,
        fromBeginning: false,
      });
      await depositConsumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;
          try {
            const envelope = JSON.parse(message.value.toString());
            await this.handlers.depositPaidHandler.handle(envelope);
          } catch (err) {
            console.error(
              "[kafka-consumer] Error processing DEPOSIT_PAID event:",
              err,
            );
          }
        },
      });
      this.consumers.push(depositConsumer);

      // 2. Consumer: CONTRACT_STATUS_CHANGED
      const contractConsumer = this.kafka.consumer({
        groupId: GROUP_TRADING_CONTRACT,
      });
      await contractConsumer.connect();
      await contractConsumer.subscribe({
        topic: TOPIC_CONTRACT_LIFECYCLE,
        fromBeginning: false,
      });
      await contractConsumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;
          try {
            const envelope = JSON.parse(message.value.toString());
            await this.handlers.contractStatusHandler.handle(envelope);
          } catch (err) {
            console.error(
              "[kafka-consumer] Error processing CONTRACT_STATUS_CHANGED event:",
              err,
            );
          }
        },
      });
      this.consumers.push(contractConsumer);

      // 3. Consumer: USER_PROFILE_UPDATED
      const profileConsumer = this.kafka.consumer({
        groupId: GROUP_TRADING_USER_PROFILE,
      });
      await profileConsumer.connect();
      await profileConsumer.subscribe({
        topic: TOPIC_USER_PROFILE,
        fromBeginning: false,
      });
      await profileConsumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;
          try {
            const envelope = JSON.parse(message.value.toString());
            await this.handlers.userProfileHandler.handle(envelope);
          } catch (err) {
            console.error(
              "[kafka-consumer] Error processing USER_PROFILE_UPDATED event:",
              err,
            );
          }
        },
      });
      this.consumers.push(profileConsumer);

      console.log(
        "[kafka-consumer] All Kafka consumers initialized and subscribed.",
      );
    } catch (error) {
      console.warn(
        "[kafka-consumer] Failed to connect Kafka consumers on startup:",
        error,
      );
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    for (const consumer of this.consumers) {
      try {
        await consumer.disconnect();
      } catch (err) {
        console.error("[kafka-consumer] Error disconnecting consumer:", err);
      }
    }
    this.consumers.length = 0;
    console.log("[kafka-consumer] All consumers stopped.");
  }
}

