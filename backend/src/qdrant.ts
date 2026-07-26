import { QdrantClient } from "@qdrant/js-client-rest";

const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY?.trim();
const COLLECTION_NAME = "chunks";

interface VectorPoint {
  id: string;
  vector: number[];
  payload: {
    notebook_id: string;
    source_id: string;
    [key: string]: any;
  };
}

export const qdrantClient = new QdrantClient({
  url: QDRANT_URL,
  ...(QDRANT_API_KEY ? { apiKey: QDRANT_API_KEY } : {}),
});

export async function ensureCollection(): Promise<void> {
  const collections = await qdrantClient.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);
  if (!exists) {
    await qdrantClient.createCollection(COLLECTION_NAME, {
      vectors: {
        size: 1536,
        distance: "Cosine",
      },
    });
  }
}

export async function upsertChunkVectors(points: VectorPoint[]): Promise<void> {
  await ensureCollection();
  await qdrantClient.upsert(COLLECTION_NAME, {
    wait: true,
    points: points.map((p) => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload,
    })),
  });
}

export async function searchNotebookChunks(
  notebookId: string,
  queryVector: number[],
  limit: number = 5
): Promise<Array<{ id: string; score: number }>> {
  await ensureCollection();
  const res = await qdrantClient.search(COLLECTION_NAME, {
    vector: queryVector,
    filter: {
      must: [
        {
          key: "notebook_id",
          match: { value: notebookId },
        },
      ],
    },
    limit,
  });
  return res.map((r) => ({ id: String(r.id), score: r.score }));
}

export async function deleteChunksBySourceId(sourceId: string): Promise<void> {
  await ensureCollection();
  await qdrantClient.delete(COLLECTION_NAME, {
    filter: {
      must: [
        {
          key: "source_id",
          match: { value: sourceId },
        },
      ],
    },
  });
}
