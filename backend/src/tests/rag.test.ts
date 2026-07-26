import { describe, test, expect, beforeAll } from "bun:test";
import { db } from "../db";
import { extractText } from "../extractors/text";
import { extractVtt } from "../extractors/vtt";
import { createChunks } from "../chunker";
import { searchNotebookChunks, upsertChunkVectors, deleteChunksBySourceId } from "../qdrant";
import { runQueryPipeline } from "../queryPipeline";
import crypto from "crypto";

describe("AxiomAI Notebook RAG Architecture Tests", () => {
  let testNotebookId: string;
  let testSourceId: string;

  beforeAll(async () => {
    const notebook = await db.notebook.create({
      data: { name: "Quantum Computing & Quantum Algorithms" },
    });
    testNotebookId = notebook.id;
  });

  test("1. Database Schema & Relations", async () => {
    expect(testNotebookId).toBeDefined();
    const fetched = await db.notebook.findUnique({
      where: { id: testNotebookId },
      include: { sources: true },
    });
    expect(fetched?.name).toBe("Quantum Computing & Quantum Algorithms");
  });

  test("2. Text & VTT Extractor Modules", async () => {
    const textRes = await extractText("Quantum supremacy is the goal of demonstrating that a programmable quantum device can solve a problem that no classical supercomputer can solve in any feasible amount of time.");
    expect(textRes.fullText).toContain("Quantum supremacy");
    expect(textRes.segments[0]?.location.type).toBe("text");

    const vttContent = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Welcome to quantum computing lectures.

2
00:00:05.000 --> 00:00:09.000
Today we discuss qubits and superposition principles.`;

    const vttRes = await extractVtt(vttContent);
    expect(vttRes.segments.length).toBe(2);
    expect(vttRes.segments[0]?.location.type).toBe("vtt");
    expect(vttRes.segments[0]?.location.startTime).toBe("00:00:01.000");
  });

  test("3. Chunker Module (Prose & Timestamped)", () => {
    const proseSegs = [
      {
        text: "Shor's algorithm is a quantum algorithm for finding the prime factors of an integer. It solves factoring in polynomial time.",
        location: { type: "text", charStart: 0, charEnd: 120 },
      },
    ];

    const chunks = createChunks("TEXT", proseSegs, 50, 10);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.location.type).toBe("text");

    const vttSegs = [
      {
        text: "Qubits exist in superposition of 0 and 1 states.",
        location: { type: "vtt", cueIndex: 1, startTime: "00:00:01.000" },
      },
    ];
    const vttChunks = createChunks("VTT", vttSegs);
    expect(vttChunks[0]?.location.startTime).toBe("00:00:01.000");
  });

  test("4. Qdrant Vector Store with notebook_id Filter Isolation", async () => {
    const vec1 = new Array(1536).fill(0.1);
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();

    await upsertChunkVectors([
      {
        id: id1,
        vector: vec1,
        payload: { notebook_id: testNotebookId, source_id: "src-100" },
      },
      {
        id: id2,
        vector: vec1,
        payload: { notebook_id: "other-notebook-999", source_id: "src-999" },
      },
    ]);

    const results = await searchNotebookChunks(testNotebookId, vec1, 5);
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe(id1);
  });

  test("5. Multi-Store Source Deletion Contract (Section 3.3)", async () => {
    const source = await db.source.create({
      data: {
        notebookId: testNotebookId,
        type: "TEXT",
        originalUri: "test-delete.txt",
        title: "Deletion Test Source",
        status: "READY",
      },
    });
    testSourceId = source.id;

    const chunkId = crypto.randomUUID();
    const chunk = await db.chunk.create({
      data: {
        id: chunkId,
        sourceId: testSourceId,
        notebookId: testNotebookId,
        text: "Temporary chunk data for deletion test.",
        chunkIndex: 0,
        location: JSON.stringify({ type: "text", charStart: 0, charEnd: 30 }),
      },
    });

    await upsertChunkVectors([
      {
        id: chunk.id,
        vector: new Array(1536).fill(0.5),
        payload: { notebook_id: testNotebookId, source_id: testSourceId },
      },
    ]);

    await db.chunk.deleteMany({ where: { sourceId: testSourceId } });
    await deleteChunksBySourceId(testSourceId);
    await db.source.delete({ where: { id: testSourceId } });

    const remainingChunks = await db.chunk.findMany({ where: { sourceId: testSourceId } });
    expect(remainingChunks.length).toBe(0);

    const qdrantCheck = await searchNotebookChunks(testNotebookId, new Array(1536).fill(0.5), 5);
    expect(qdrantCheck.some((r) => r.id === chunk.id)).toBe(false);
  });

  test("6. Full RAG Query Pipeline Execution & Citations", async () => {
    const source = await db.source.create({
      data: {
        notebookId: testNotebookId,
        type: "TEXT",
        originalUri: "quantum-algo.txt",
        title: "Quantum Algorithms Guide",
        status: "READY",
      },
    });

    const chunkId = crypto.randomUUID();
    await db.chunk.create({
      data: {
        id: chunkId,
        sourceId: source.id,
        notebookId: testNotebookId,
        text: "Grover's algorithm provides a quadratic speedup for unstructured search problems on quantum hardware.",
        chunkIndex: 0,
        location: JSON.stringify({ type: "text", charStart: 0, charEnd: 98 }),
      },
    });

    await upsertChunkVectors([
      {
        id: chunkId,
        vector: new Array(1536).fill(0.2),
        payload: { notebook_id: testNotebookId, source_id: source.id },
      },
    ]);

    const result = await runQueryPipeline(testNotebookId, "What speedup does Grover's algorithm provide?");

    expect(result.queryId).toBeDefined();
    expect(result.text).toBeDefined();
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0]?.chunkId).toBe(chunkId);
  }, 20000);
});

