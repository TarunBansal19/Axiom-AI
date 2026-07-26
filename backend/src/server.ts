import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import { db } from "./db";
import { putFile, getFile, deleteFile } from "./storage";
import { addIngestionJob, initQueue } from "./queue";
import { processSourceIngestion } from "./ingestionWorker";
import { runQueryPipeline } from "./queryPipeline";
import { deleteChunksBySourceId } from "./qdrant";
import { generateFlashcardDeck, getFlashcardDecks, deleteFlashcardDeck, explainFlashcard } from "./flashcards";
import { generateQuiz, getQuizzes, deleteQuiz } from "./quiz";
import { generateMindMap, getMindMaps, deleteMindMap } from "./mindmap";
import { generateRoadmap, getRoadmaps, updateRoadmapStage, deleteRoadmap } from "./roadmap";
import { fetchPlaylistMetadata } from "./youtube";
import { generateOverview, getOverview } from "./overview";
import { clerkMiddleware, getAuth } from "@clerk/express";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(clerkMiddleware());

// Protect all /api routes
app.use('/api', (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

initQueue().catch(() => {});

// Helper: get or create default notebook if not specified
async function getDefaultNotebookId(userId: string): Promise<string> {
  const existing = await db.notebook.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: "asc" } });
  if (existing) return existing.id;
  const created = await db.notebook.create({ data: { name: "Default Notebook", ownerId: userId } });
  return created.id;
}

// 1. POST /notebooks
app.post("/api/notebooks", async (req: Request, res: Response) => {
  try {
    const userId = getAuth(req).userId as string;
    const { name, title } = req.body;
    const notebookName = name || title;
    if (!notebookName || typeof notebookName !== "string") {
      return res.status(400).json({ error: "Notebook name is required" });
    }
    const notebook = await db.notebook.create({
      data: { name: notebookName.trim(), ownerId: userId },
      include: {
        sources: true,
        queries: { include: { answer: true } }
      }
    });
    return res.status(201).json(notebook);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 2. GET /notebooks
app.get("/api/notebooks", async (req: Request, res: Response) => {
  try {
    const userId = getAuth(req).userId as string;
    const notebooks = await db.notebook.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        sources: true,
      },
    });
    return res.json(notebooks);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 3. GET /notebooks/:id
app.get("/api/notebooks/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id || "";
    const userId = getAuth(req).userId as string;
    const notebook = await db.notebook.findUnique({
      where: { id },
      include: {
        sources: { orderBy: { createdAt: "desc" } },
        queries: {
          orderBy: { createdAt: "asc" },
          include: { answer: true },
        },
      },
    });
    if (!notebook || notebook.ownerId !== userId) {
      return res.status(404).json({ error: "Notebook not found" });
    }
    return res.json(notebook);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 3.1 PUT /notebooks/:id
app.put("/api/notebooks/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id || "";
    const userId = getAuth(req).userId as string;
    const existing = await db.notebook.findUnique({ where: { id } });
    if (!existing || existing.ownerId !== userId) {
      return res.status(404).json({ error: "Notebook not found" });
    }
    const { name, isPinned } = req.body;
    const notebook = await db.notebook.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(isPinned !== undefined && { isPinned }),
      },
    });
    return res.json(notebook);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 3.2 DELETE /notebooks/:id
app.delete("/api/notebooks/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id || "";
    const userId = getAuth(req).userId as string;
    const existing = await db.notebook.findUnique({ where: { id } });
    if (!existing || existing.ownerId !== userId) {
      return res.status(404).json({ error: "Notebook not found" });
    }
    // Note: Prisma cascade delete will remove associated sources/chunks/etc
    await db.notebook.delete({ where: { id } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 4. POST /sources (and alias POST /ingest)
const handleSourceCreation = async (req: Request, res: Response) => {
  try {
    let { notebookId, type, originalUri, title, textContent, content, metadata } = req.body;
    const userId = getAuth(req).userId as string;

    if (!notebookId) {
      notebookId = await getDefaultNotebookId(userId);
    }

    // Default to TEXT type if content is provided
    if (!type && (content || textContent)) {
      type = "TEXT";
    }

    if (content && !textContent) {
      textContent = content;
    }

    if (!type) {
      return res.status(400).json({ error: "type or content is required" });
    }

    const notebook = await db.notebook.findUnique({ where: { id: notebookId } });
    if (!notebook || notebook.ownerId !== userId) {
      return res.status(404).json({ error: "Notebook not found" });
    }

    let rawContentRef: string | undefined = undefined;
    let finalUri = originalUri || (metadata && metadata.source) || "";
    let sourceTitle = title || (metadata && metadata.title);

    if (type === "PDF" || type === "VTT") {
      if (!req.file) {
        return res.status(400).json({ error: `File is required for source type ${type}` });
      }
      const storageKey = `sources/${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await putFile(storageKey, req.file.buffer);
      rawContentRef = storageKey;
      finalUri = req.file.originalname;
      if (!sourceTitle) sourceTitle = req.file.originalname;
    } else if (type === "TEXT") {
      if (textContent) {
        const storageKey = `sources/${Date.now()}_text.txt`;
        await putFile(storageKey, Buffer.from(textContent, "utf-8"));
        rawContentRef = storageKey;
      }
      if (!sourceTitle) sourceTitle = finalUri || "Text Source";
    } else if (type === "URL" || type === "YOUTUBE" || type === "YOUTUBE_PLAYLIST" || type === "youtube_playlist") {
      if (!sourceTitle) sourceTitle = finalUri;
      
      const playlistRegex1 = /^https?:\/\/(www\.)?youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/;
      const playlistRegex2 = /^https?:\/\/(www\.)?youtube\.com\/watch\?v=.*[&?]list=([a-zA-Z0-9_-]+)/;
      
      const match = finalUri.match(playlistRegex1) || finalUri.match(playlistRegex2);
      if (match && match[2]) {
        type = "youtube_playlist";
        
        try {
          // Fetch playlist metadata and transcripts synchronously here to save them to the source directly.
          // Note: In a production app, fetching transcripts for a huge playlist should be asynchronous,
          // but for this implementation we await it here so the source has the full transcript bundle immediately.
          const metadata = await fetchPlaylistMetadata(match[2]);
          if (!title) {
            sourceTitle = metadata.playlistTitle;
          }
          const storageKey = `sources/${Date.now()}_playlist.json`;
          await putFile(storageKey, Buffer.from(JSON.stringify(metadata), "utf-8"));
          rawContentRef = storageKey;
        } catch (e) {
          return res.status(500).json({ error: `Failed to fetch YouTube playlist: ${(e as Error).message}` });
        }
      }
    }

    const source = await db.source.create({
      data: {
        notebookId,
        type,
        originalUri: finalUri,
        title: sourceTitle,
        status: "UPLOADING",
        rawContentRef,
      },
    });

    await addIngestionJob(source.id);

    return res.status(202).json(source);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
};

app.post("/api/sources", upload.single("file"), handleSourceCreation);
app.post("/api/ingest", upload.single("file"), handleSourceCreation);

// 5. GET /sources/:id/status
app.get("/api/sources/:id/status", async (req: Request, res: Response) => {
  try {
    const id = req.params.id || "";
    const source = await db.source.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        statusDetail: true,
        indexedAt: true,
      },
    });
    if (!source) {
      return res.status(404).json({ error: "Source not found" });
    }
    return res.json(source);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 6. PUT /sources/:id
app.put("/api/sources/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id || "";
    const { title } = req.body;
    const source = await db.source.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
      },
    });
    return res.json(source);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 6.1 DELETE /sources/:id
app.delete("/api/sources/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id || "";
    const source = await db.source.findUnique({ where: { id } });
    if (!source) {
      return res.status(404).json({ error: "Source not found" });
    }

    await db.chunk.deleteMany({ where: { sourceId: id } });
    await deleteChunksBySourceId(id);

    if (source.rawContentRef) {
      await deleteFile(source.rawContentRef);
    }

    await db.source.delete({ where: { id } });

    return res.json({ success: true, message: "Source deleted across all storage systems" });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 7. POST /sources/:id/reindex
app.post("/api/sources/:id/reindex", async (req: Request, res: Response) => {
  try {
    const id = req.params.id || "";
    const source = await db.source.findUnique({ where: { id } });
    if (!source) {
      return res.status(404).json({ error: "Source not found" });
    }

    await db.source.update({
      where: { id },
      data: { status: "EXTRACTING", statusDetail: "Re-indexing requested" },
    });

    await addIngestionJob(id);

    return res.json({ success: true, message: "Re-indexing queued", sourceId: id });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 8. POST /query
app.post("/api/query", async (req: Request, res: Response) => {
  try {
    const userId = getAuth(req).userId as string;
    let { notebookId, question, query } = req.body;
    const finalQuestion = question || query;

    if (!finalQuestion) {
      return res.status(400).json({ error: "question or query is required" });
    }

    if (!notebookId) {
      notebookId = await getDefaultNotebookId(userId);
    }

    const result = await runQueryPipeline(notebookId, finalQuestion);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 9. GET /chunks/:id
app.get("/api/chunks/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id || "";
    const chunk = await db.chunk.findUnique({
      where: { id },
      include: { source: true },
    });
    if (!chunk) {
      return res.status(404).json({ error: "Chunk not found" });
    }

    let rawContentText: string | null = null;
    if (chunk.source.rawContentRef) {
      try {
        const fileBuf = await getFile(chunk.source.rawContentRef);
        rawContentText = fileBuf.toString("utf-8");
      } catch (err) {
        rawContentText = null;
      }
    }

    return res.json({
      id: chunk.id,
      notebookId: chunk.notebookId,
      sourceId: chunk.sourceId,
      text: chunk.text,
      chunkIndex: chunk.chunkIndex,
      location: JSON.parse(chunk.location),
      source: {
        id: chunk.source.id,
        title: chunk.source.title,
        type: chunk.source.type,
        originalUri: chunk.source.originalUri,
        rawContentRef: chunk.source.rawContentRef,
      },
      rawContentText,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 9b. GET /sources/:id/file — Serve raw source file (PDF, etc.)
app.get("/api/sources/:id/file", async (req: Request, res: Response) => {
  try {
    const id = req.params.id || "";
    const source = await db.source.findUnique({ where: { id } });
    if (!source || !source.rawContentRef) {
      return res.status(404).json({ error: "Source file not found" });
    }

    const fileBuf = await getFile(source.rawContentRef);
    if (source.type === "PDF") {
      res.setHeader("Content-Type", "application/pdf");
    } else if (source.type === "VTT") {
      res.setHeader("Content-Type", "text/vtt");
    } else {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    return res.send(fileBuf);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 10. POST /notebooks/:notebookId/flashcards — Generate or return cached deck
app.post("/api/notebooks/:notebookId/flashcards", async (req: Request, res: Response) => {
  try {
    const notebookId = req.params.notebookId || "";
    const { sourceIds, count = 15, regenerate = false } = req.body;

    if (!sourceIds || !Array.isArray(sourceIds) || sourceIds.length === 0) {
      return res.status(400).json({ error: "sourceIds array is required and must not be empty" });
    }

    const notebook = await db.notebook.findUnique({ where: { id: notebookId } });
    if (!notebook) {
      return res.status(404).json({ error: "Notebook not found" });
    }

    const deck = await generateFlashcardDeck(notebookId, sourceIds, count, regenerate);
    return res.json({ deck });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 11. GET /notebooks/:notebookId/flashcards — Get existing decks
app.get("/api/notebooks/:notebookId/flashcards", async (req: Request, res: Response) => {
  try {
    const notebookId = req.params.notebookId || "";
    const decks = await getFlashcardDecks(notebookId);
    return res.json({ decks });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 12. DELETE /notebooks/:notebookId/flashcards/:deckId — Delete a deck
app.delete("/api/notebooks/:notebookId/flashcards/:deckId", async (req: Request, res: Response) => {
  try {
    const notebookId = req.params.notebookId || "";
    const deckId = req.params.deckId || "";
    await deleteFlashcardDeck(deckId, notebookId);
    return res.json({ success: true, message: "Flashcard deck deleted" });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 13. POST /flashcards/explain — Get deeper explanation for a card
app.post("/api/flashcards/explain", async (req: Request, res: Response) => {
  try {
    const { question, answer } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ error: "question and answer are required" });
    }
    const explanation = await explainFlashcard(question, answer);
    return res.json({ explanation });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 14. POST /notebooks/:notebookId/quiz — Generate or return cached quiz
app.post("/api/notebooks/:notebookId/quiz", async (req: Request, res: Response) => {
  try {
    const notebookId = req.params.notebookId || "";
    const { sourceIds, count = 10, regenerate = false } = req.body;

    if (!sourceIds || !Array.isArray(sourceIds) || sourceIds.length === 0) {
      return res.status(400).json({ error: "sourceIds array is required and must not be empty" });
    }

    const notebook = await db.notebook.findUnique({ where: { id: notebookId } });
    if (!notebook) {
      return res.status(404).json({ error: "Notebook not found" });
    }

    const quiz = await generateQuiz(notebookId, sourceIds, count, regenerate);
    return res.json({ quiz });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 15. GET /notebooks/:notebookId/quiz — Get existing quizzes
app.get("/api/notebooks/:notebookId/quiz", async (req: Request, res: Response) => {
  try {
    const notebookId = req.params.notebookId || "";
    const quizzes = await getQuizzes(notebookId);
    return res.json({ quizzes });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 16. DELETE /notebooks/:notebookId/quiz/:quizId — Delete a quiz
app.delete("/api/notebooks/:notebookId/quiz/:quizId", async (req: Request, res: Response) => {
  try {
    const notebookId = req.params.notebookId || "";
    const quizId = req.params.quizId || "";
    await deleteQuiz(quizId, notebookId);
    return res.json({ success: true, message: "Quiz deleted" });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 17. POST /notebooks/:notebookId/mindmap — Generate or return cached mind map
app.post("/api/notebooks/:notebookId/mindmap", async (req: Request, res: Response) => {
  try {
    const notebookId = req.params.notebookId || "";
    const { sourceIds, regenerate = false } = req.body;

    if (!sourceIds || !Array.isArray(sourceIds) || sourceIds.length === 0) {
      return res.status(400).json({ error: "sourceIds array is required and must not be empty" });
    }

    const notebook = await db.notebook.findUnique({ where: { id: notebookId } });
    if (!notebook) {
      return res.status(404).json({ error: "Notebook not found" });
    }

    const mindMap = await generateMindMap(notebookId, sourceIds, regenerate);
    return res.json({ mindMap });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 18. GET /notebooks/:notebookId/mindmap — Get existing mind maps
app.get("/api/notebooks/:notebookId/mindmap", async (req: Request, res: Response) => {
  try {
    const notebookId = req.params.notebookId || "";
    const mindMaps = await getMindMaps(notebookId);
    return res.json({ mindMaps });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 19. DELETE /notebooks/:notebookId/mindmap/:mapId — Delete a mind map
app.delete("/api/notebooks/:notebookId/mindmap/:mapId", async (req: Request, res: Response) => {
  try {
    const notebookId = req.params.notebookId || "";
    const mapId = req.params.mapId || "";
    await deleteMindMap(mapId, notebookId);
    return res.json({ success: true, message: "Mind map deleted" });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 20. POST /notebooks/:notebookId/roadmap — Generate or return cached roadmap
app.post("/api/notebooks/:notebookId/roadmap", async (req: Request, res: Response) => {
  try {
    const notebookId = req.params.notebookId || "";
    const { sourceId, regenerate = false } = req.body;

    if (!sourceId) {
      return res.status(400).json({ error: "sourceId is required" });
    }

    const notebook = await db.notebook.findUnique({ where: { id: notebookId } });
    if (!notebook) {
      return res.status(404).json({ error: "Notebook not found" });
    }

    const roadmap = await generateRoadmap(notebookId, sourceId, regenerate);
    return res.json({ roadmap });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 21. GET /notebooks/:notebookId/roadmap — Get existing roadmaps
app.get("/api/notebooks/:notebookId/roadmap", async (req: Request, res: Response) => {
  try {
    const notebookId = req.params.notebookId || "";
    const roadmaps = await getRoadmaps(notebookId);
    return res.json({ roadmaps });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 22. PUT /notebooks/:notebookId/roadmap/:roadmapId/stages/:stageId — Update stage completion
app.put("/api/notebooks/:notebookId/roadmap/:roadmapId/stages/:stageId", async (req: Request, res: Response) => {
  try {
    const roadmapId = req.params.roadmapId || "";
    const stageId = req.params.stageId || "";
    const { completed } = req.body;
    await updateRoadmapStage(roadmapId, stageId, !!completed);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 23. DELETE /notebooks/:notebookId/roadmap/:roadmapId — Delete a roadmap
app.delete("/api/notebooks/:notebookId/roadmap/:roadmapId", async (req: Request, res: Response) => {
  try {
    const notebookId = req.params.notebookId || "";
    const roadmapId = req.params.roadmapId || "";
    await deleteRoadmap(roadmapId, notebookId);
    return res.json({ success: true, message: "Roadmap deleted" });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 24. POST /notebooks/:notebookId/overview — Generate overview
app.post("/api/notebooks/:notebookId/overview", async (req: Request, res: Response) => {
  try {
    const notebookId = req.params.notebookId || "";
    const { sourceIds } = req.body;

    if (!sourceIds || !Array.isArray(sourceIds) || sourceIds.length === 0) {
      return res.status(400).json({ error: "sourceIds array is required" });
    }

    const notebook = await db.notebook.findUnique({ where: { id: notebookId } });
    if (!notebook) {
      return res.status(404).json({ error: "Notebook not found" });
    }

    const overview = await generateOverview(notebookId, sourceIds);
    return res.json({ overview });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// 25. GET /notebooks/:notebookId/overview — Get existing overview
app.get("/api/notebooks/:notebookId/overview", async (req: Request, res: Response) => {
  try {
    const notebookId = req.params.notebookId || "";
    const overview = await getOverview(notebookId);
    return res.json({ overview });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// Serve frontend static build if available (must be after all API routes)
import path from "path";
const FRONTEND_DIST = path.resolve(process.cwd(), "../frontend/dist");
app.use(express.static(FRONTEND_DIST));

app.get("*", (req: Request, res: Response) => {
  if (!req.path.startsWith("/api")) {
    const indexPath = path.join(FRONTEND_DIST, "index.html");
    return res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(404).json({ error: "Frontend build index.html not found. Please build frontend." });
      }
    });
  } else {
    return res.status(404).json({ error: "Route not found" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`AxiomAI server running on http://localhost:${PORT}`);
  console.log(`Ingestion: direct in-process mode (no Redis/BullMQ)`);
});
