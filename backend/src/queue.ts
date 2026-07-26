import { Queue } from "bullmq";

import IORedis from "ioredis";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_URL = process.env.REDIS_URL;

export const QUEUE_NAME = "ingestion";

// Create a single shared connection config that BullMQ expects (either an IORedis instance or valid options)
export const redisConfig = REDIS_URL 
  ? new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
  : { host: REDIS_HOST, port: REDIS_PORT, maxRetriesPerRequest: null };

export const queue = new Queue(QUEUE_NAME, { connection: redisConfig });

export async function initQueue() {
  // Queue automatically connects on first command
}

export async function addIngestionJob(sourceId: string): Promise<void> {
  try {
    await queue.add("process-source", { sourceId });
  } catch (err) {
    console.warn(`BullMQ/Redis queue unavailable for job ${sourceId}, falling back to background processing:`, (err as Error).message);
    const { processSourceIngestion } = await import("./ingestionWorker");
    processSourceIngestion(sourceId).catch((e) => console.error(`Fallback ingestion failed for ${sourceId}:`, e));
  }
}


