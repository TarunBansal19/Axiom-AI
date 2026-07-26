export const QUEUE_NAME = "ingestion";

export async function initQueue() {
  // No-op: using direct in-process ingestion (no Redis/BullMQ dependency)
}

export async function addIngestionJob(sourceId: string): Promise<void> {
  // Process ingestion directly in-process (fire-and-forget)
  // This avoids Redis eviction policy issues on Render's managed Redis
  const { processSourceIngestion } = await import("./ingestionWorker");
  processSourceIngestion(sourceId).catch((e) =>
    console.error(`Ingestion failed for ${sourceId}:`, e)
  );
}
