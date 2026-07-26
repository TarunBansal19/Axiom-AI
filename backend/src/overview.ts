import { db } from "./db";
import { generateJSON } from "./llm";
import { getFile } from "./storage";

export interface NotebookOverviewResult {
  id: string;
  notebookId: string;
  sourceIds: string[];
  title: string;
  summaryMarkdown: string;
  suggestedQuestions: string[];
  generatedAt: string;
}

export async function generateOverview(
  notebookId: string,
  sourceIds: string[]
): Promise<NotebookOverviewResult> {
  const sources = await db.source.findMany({
    where: { id: { in: sourceIds }, notebookId }
  });

  if (sources.length === 0) {
    throw new Error("No sources found for overview generation.");
  }

  // Concatenate source text from database chunks or raw storage
  let combinedText = "";
  for (const source of sources) {
    let text = "";
    const chunks = await db.chunk.findMany({
      where: { sourceId: source.id, notebookId },
      orderBy: { chunkIndex: "asc" },
    });
    if (chunks.length > 0) {
      text = chunks.map((c) => c.text).join("\n\n");
    } else if (source.rawContentRef) {
      try {
        const fileBuf = await getFile(source.rawContentRef);
        text = fileBuf.toString("utf-8");
      } catch (err) {
        text = "";
      }
    }
    if (text) {
      combinedText += `\n--- SOURCE: ${source.title || source.originalUri} ---\n${text.substring(0, 15000)}\n`;
    }
  }

  if (!combinedText.trim()) {
    throw new Error("Source text is empty, cannot generate overview.");
  }

  const prompt = `
Summarize the following source material for someone opening it for the first time.

SOURCE TEXT:
"""
${combinedText.substring(0, 40000)}
"""

Write:
1. A short, descriptive title for this material (used as a heading — should read like the document's actual title/topic, not a generic label).
2. A single summary paragraph (up to ~180 words) written in plain prose (not bullet points). Bold (using **markdown**) the 6-10 most important key terms, named concepts, numbers, or proper nouns — these should look like the highlighted terms a careful reader would underline.
3. Three suggested follow-up questions a curious reader would want to ask about this material, phrased naturally (not "What is X?" every time — vary the phrasing, make them specific to this content, not generic).

Return ONLY JSON matching schema:
{
  "title": string,
  "summaryMarkdown": string,
  "suggestedQuestions": [string, string, string]
}
`;

  let overviewData = {
    title: sources[0]?.title || "Notebook Overview",
    summaryMarkdown: "A summary could not be automatically generated for the selected sources.",
    suggestedQuestions: [
      "What are the main key concepts covered in these sources?",
      "How do the findings in this material apply in practice?",
      "What are the primary conclusions drawn by the author?"
    ]
  };

  try {
    const parsed = await generateJSON<{ title?: string; summaryMarkdown?: string; suggestedQuestions?: string[] }>(
      prompt,
      "You are a helpful assistant. Always return valid JSON matching schema.",
      "openai/gpt-4o-mini"
    );

    if (parsed.title) overviewData.title = parsed.title;
    if (parsed.summaryMarkdown) overviewData.summaryMarkdown = parsed.summaryMarkdown;
    if (parsed.suggestedQuestions && Array.isArray(parsed.suggestedQuestions)) {
      overviewData.suggestedQuestions = parsed.suggestedQuestions.slice(0, 3);
    }
  } catch (err) {
    console.warn("Failed to generate overview from LLM, using fallback", err);
  }

  const savedOverview = await db.notebookOverview.upsert({
    where: { notebookId },
    update: {
      sourceIds: JSON.stringify(sourceIds),
      title: overviewData.title,
      summaryMarkdown: overviewData.summaryMarkdown,
      suggestedQuestions: JSON.stringify(overviewData.suggestedQuestions),
      generatedAt: new Date(),
    },
    create: {
      notebookId,
      sourceIds: JSON.stringify(sourceIds),
      title: overviewData.title,
      summaryMarkdown: overviewData.summaryMarkdown,
      suggestedQuestions: JSON.stringify(overviewData.suggestedQuestions),
    }
  });

  return {
    id: savedOverview.id,
    notebookId: savedOverview.notebookId,
    sourceIds: JSON.parse(savedOverview.sourceIds),
    title: savedOverview.title,
    summaryMarkdown: savedOverview.summaryMarkdown,
    suggestedQuestions: JSON.parse(savedOverview.suggestedQuestions),
    generatedAt: savedOverview.generatedAt.toISOString(),
  };
}

export async function getOverview(notebookId: string): Promise<NotebookOverviewResult | null> {
  const record = await db.notebookOverview.findUnique({
    where: { notebookId },
  });
  
  if (!record) return null;

  return {
    id: record.id,
    notebookId: record.notebookId,
    sourceIds: JSON.parse(record.sourceIds),
    title: record.title,
    summaryMarkdown: record.summaryMarkdown,
    suggestedQuestions: JSON.parse(record.suggestedQuestions),
    generatedAt: record.generatedAt.toISOString(),
  };
}
