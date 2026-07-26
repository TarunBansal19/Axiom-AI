import { Queue } from "bullmq";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);

export const QUEUE_NAME = "ingestion";

export const redisConfig = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
};

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


