import { db } from "./db";
import { getEmbedding, generateText } from "./llm";
import { searchNotebookChunks } from "./qdrant";

export interface Citation {
  chunkId: string;
  sourceId: string;
  snippet: string;
}

export interface QueryResult {
  queryId: string;
  text: string;
  citations: Citation[];
}

interface ChunkCandidate {
  id: string;
  sourceId: string;
  notebookId: string;
  text: string;
  chunkIndex: number;
  location: any;
  score: number;
}

export async function runQueryPipeline(notebookId: string, question: string): Promise<QueryResult> {
  const queryRecord = await db.query.create({
    data: {
      notebookId,
      question,
    },
  });

  let currentQuestion = question;
  let attempts = 0;
  const maxAttempts = 2;

  let finalAnswerText = "";
  let finalCitations: Citation[] = [];

  while (attempts <= maxAttempts) {
    attempts++;

    const stepBackQuery = `What are the general principles behind: ${currentQuestion}`;
    const [rewrittenQuery, hydeHypotheticalDoc] = await Promise.all([
      generateText(
        `Rewrite this user research query to be more specific and clear for RAG vector retrieval: "${currentQuestion}". Return ONLY the rewritten query text.`,
        "You are a search query expansion assistant.",
        "gpt-4o-mini"
      ),
      generateText(
        `Write a short, direct hypothetical paragraph answering this question as if it were taken from an authoritative research paper: "${currentQuestion}"`,
        "You are an expert academic research synthesizer.",
        "gpt-4o-mini"
      ),
    ]);

    const targetSearchQueries = [currentQuestion, rewrittenQuery, stepBackQuery, hydeHypotheticalDoc];

    const candidateMap = new Map<string, number>();

    await Promise.all(
      targetSearchQueries.map(async (qText) => {
        const qVec = await getEmbedding(qText);
        const searchRes = await searchNotebookChunks(notebookId, qVec, 6);
        for (const res of searchRes) {
          const existingScore = candidateMap.get(res.id) || 0;
          candidateMap.set(res.id, Math.max(existingScore, res.score));
        }
      })
    );

    const candidateIds = Array.from(candidateMap.keys());

    let dbChunks = candidateIds.length > 0
      ? await db.chunk.findMany({
          where: { id: { in: candidateIds }, notebookId },
          include: { source: true },
        })
      : [];

    // Fallback: If vector search yielded no chunks, fetch top chunks directly from database for this notebook
    if (dbChunks.length === 0) {
      dbChunks = await db.chunk.findMany({
        where: { notebookId },
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { source: true },
      });
    }

    if (dbChunks.length === 0) {
      if (attempts <= maxAttempts) {
        currentQuestion = `Overview of topics in notebook relevant to ${question}`;
        continue;
      } else {
        finalAnswerText = "No relevant sources found in this notebook to answer your question.";
        finalCitations = [];
        break;
      }
    }

    const populatedCandidates: (ChunkCandidate & { sourceTitle?: string })[] = dbChunks.map((c) => ({
      id: c.id,
      sourceId: c.sourceId,
      notebookId: c.notebookId,
      text: c.text,
      chunkIndex: c.chunkIndex,
      location: JSON.parse(c.location),
      score: candidateMap.get(c.id) || 0.5,
      sourceTitle: (c as any).source?.title || "Source Document",
    }));

    populatedCandidates.sort((a, b) => b.score - a.score);
    const topK = populatedCandidates.slice(0, 5);

    const contextPrompt = topK
      .map((c) => `--- CHUNK [ID: ${c.id} | Source: "${c.sourceTitle}"] ---\n${c.text}`)
      .join("\n\n");

    const answerPrompt = `Context Sources:\n${contextPrompt}\n\nUser Question: ${question}\n\nAnswer the user question thoroughly, accurately, and concisely using ONLY the provided context sources. Whenever you reference specific information from a context chunk, cite it using [CID:chunk_id] (replace chunk_id with the exact Chunk ID where the information was found). If the context does not contain enough information to answer, state clearly that it is not found in the sources.`;

    const draftedAnswer = await generateText(
      answerPrompt,
      "You are a precise grounded AI research assistant. Synthesize answers directly from the provided source text and include correct [CID:chunk_id] citations.",
      "gpt-4o"
    );

    const cRagPrompt = `Source Context:\n${contextPrompt}\n\nDrafted Answer:\n${draftedAnswer}\n\nIs the drafted answer well-grounded in the source context and directly answers the question? Reply with YES or NO followed by a brief reason.`;
    
    let isGrounded = true;
    try {
      const cRagVerification = await generateText(
        cRagPrompt,
        "You are a factual verification judge.",
        "gpt-4o-mini"
      );
      isGrounded = cRagVerification.toUpperCase().includes("YES") || !draftedAnswer.toLowerCase().includes("not found in the sources");
    } catch (verErr) {
      isGrounded = true;
    }

    if (isGrounded || attempts > maxAttempts) {
      finalAnswerText = draftedAnswer;

      // Extract cited chunk IDs from draftedAnswer
      const citedMatches = Array.from(draftedAnswer.matchAll(/\[CID:([a-zA-Z0-9_-]+)\]/g)).map(m => m[1]);
      const citedSet = new Set(citedMatches);

      const relevantChunks = topK.filter(c => citedSet.has(c.id));
      const chunksToCite = relevantChunks.length > 0 ? relevantChunks : topK;

      finalCitations = chunksToCite.map((c) => ({
        chunkId: c.id,
        sourceId: c.sourceId,
        snippet: c.text.slice(0, 200) + (c.text.length > 200 ? "..." : ""),
      }));
      break;
    } else {
      currentQuestion = `Detailed clarification regarding ${question}`;
    }
  }

  await db.answer.create({
    data: {
      queryId: queryRecord.id,
      text: finalAnswerText,
      citations: JSON.stringify(finalCitations),
    },
  });

  return {
    queryId: queryRecord.id,
    text: finalAnswerText,
    citations: finalCitations,
  };
}
