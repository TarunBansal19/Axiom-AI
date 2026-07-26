import "dotenv/config";
import { db } from "./db";
import { getFile } from "./storage";
import { extractPdf } from "./extractors/pdf";
import { extractText } from "./extractors/text";
import { extractUrl } from "./extractors/url";
import { extractYoutube } from "./extractors/youtube";
import { extractVtt } from "./extractors/vtt";
import { createChunks } from "./chunker";
import { getEmbedding, getEmbeddings } from "./llm";
import { upsertChunkVectors, deleteChunksBySourceId } from "./qdrant";
import crypto from "crypto";

export async function processSourceIngestion(sourceId: string): Promise<void> {
  const source = await db.source.findUnique({ where: { id: sourceId } });
  if (!source) return;

  try {
    // Stage 1: EXTRACTING
    await db.source.update({
      where: { id: sourceId },
      data: { status: "EXTRACTING", statusDetail: "Extracting content from source" },
    });

    let extraction: { fullText: string; title?: string; segments: any[] };

    if (source.type === "PDF") {
      const fileBuffer = await getFile(source.rawContentRef || source.originalUri);
      extraction = await extractPdf(fileBuffer);
    } else if (source.type === "TEXT") {
      const content = source.rawContentRef ? (await getFile(source.rawContentRef)).toString("utf-8") : source.originalUri;
      extraction = await extractText(content);
    } else if (source.type === "URL") {
      extraction = await extractUrl(source.originalUri);
    } else if (source.type === "YOUTUBE") {
      extraction = await extractYoutube(source.originalUri);
    } else if (source.type === "VTT") {
      const content = source.rawContentRef ? (await getFile(source.rawContentRef)).toString("utf-8") : source.originalUri;
      extraction = await extractVtt(content);
    } else if (source.type === "youtube_playlist" || source.type === "YOUTUBE_PLAYLIST") {
      const contentBuf = source.rawContentRef ? await getFile(source.rawContentRef) : null;
      if (!contentBuf) throw new Error("Playlist content file not found.");
      const playlistData = JSON.parse(contentBuf.toString("utf-8"));
      const segments = (playlistData.videos || []).map((v: any) => ({
        text: v.transcript ? `[Video ${v.position + 1}: ${v.title}]\n${v.transcript}` : `[Video ${v.position + 1}: ${v.title}]\n(No transcript available)`,
        location: { type: "youtube_playlist", videoId: v.videoId, position: v.position, title: v.title },
      }));
      extraction = {
        fullText: segments.map((s: any) => s.text).join("\n\n"),
        title: playlistData.playlistTitle || source.title || "YouTube Playlist",
        segments,
      };
    } else {
      throw new Error(`Unsupported source type: ${source.type}`);
    }

    // Update title if extracted
    if (extraction.title && !source.title) {
      await db.source.update({
        where: { id: sourceId },
        data: { title: extraction.title },
      });
    }

    // Stage 2: CHUNKING
    await db.source.update({
      where: { id: sourceId },
      data: { status: "CHUNKING", statusDetail: "Segmenting content into RAG chunks" },
    });

    const preparedChunks = createChunks(source.type, extraction.segments);

    if (preparedChunks.length === 0) {
      throw new Error("No readable text could be extracted from this source.");
    }

    // Stage 3: EMBEDDING
    await db.source.update({
      where: { id: sourceId },
      data: { status: "EMBEDDING", statusDetail: "Generating vector embeddings for chunks" },
    });

    // Delete existing chunks if re-indexing
    await db.chunk.deleteMany({ where: { sourceId } });
    await deleteChunksBySourceId(sourceId);

    // Generate embeddings and store in Postgres & Qdrant
    const qdrantPoints: Array<{ id: string; vector: number[]; payload: any }> = [];

    const BATCH_SIZE = 100;
    for (let i = 0; i < preparedChunks.length; i += BATCH_SIZE) {
      const batch = preparedChunks.slice(i, i + BATCH_SIZE);
      const cleanTexts = batch.map(p => p.text.replace(/\u0000/g, ""));
      const vectors = await getEmbeddings(cleanTexts);

      const dbData = batch.map((prepared, index) => {
        const chunkId = crypto.randomUUID();
        const cleanText = cleanTexts[index] as string;
        const vector = vectors[index] as number[];

        qdrantPoints.push({
          id: chunkId,
          vector,
          payload: {
            notebook_id: source.notebookId,
            source_id: sourceId,
            chunk_index: prepared.chunkIndex,
          }
        });

        return {
          id: chunkId,
          sourceId,
          notebookId: source.notebookId,
          text: cleanText,
          chunkIndex: prepared.chunkIndex,
          location: JSON.stringify(prepared.location),
        };
      });

      await db.chunk.createMany({
        data: dbData
      });
    }// Synchronously upsert vectors to Qdrant
    await upsertChunkVectors(qdrantPoints);

    // Stage 4: READY
    await db.source.update({
      where: { id: sourceId },
      data: {
        status: "READY",
        statusDetail: null,
        indexedAt: new Date(),
      },
    });

    // Overview Generation Trigger
    try {
      const { generateOverview } = await import("./overview");
      // Check if an overview already exists for this notebook
      const existingOverview = await db.notebookOverview.findUnique({
        where: { notebookId: source.notebookId }
      });
      
      // If it's a youtube_playlist, the transcript was saved in rawContentText during ingestion (in server.ts).
      // We can summarize it.
      
      // Only generate automatically if there's no overview yet. (The spec says: "adding the first source to an empty notebook auto-generates")
      if (!existingOverview) {
        // Fetch all ready sources for this notebook to include in overview
        const readySources = await db.source.findMany({
          where: { notebookId: source.notebookId, status: "READY" }
        });
        if (readySources.length > 0) {
           await generateOverview(source.notebookId, readySources.map(s => s.id));
        }
      }
    } catch (overviewErr) {
      console.warn("Failed to generate notebook overview after ingestion:", overviewErr);
    }
  } catch (err) {
    const errorMsg = (err as Error).message || "Unknown error during ingestion";
    await db.source.update({
      where: { id: sourceId },
      data: {
        status: "FAILED",
        statusDetail: errorMsg,
      },
    });
    console.error(`Source ingestion failed for ${sourceId}:`, errorMsg);
  }
}
