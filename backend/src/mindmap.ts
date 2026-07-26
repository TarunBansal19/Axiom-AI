import { db } from "./db";
import { generateJSON, generateText } from "./llm";
import crypto from "crypto";

export interface MindMapNode {
  id: string;
  label: string;
  summary?: string;
  children: MindMapNode[];
}

export interface MindMapResult {
  id: string;
  notebookId: string;
  sourceIds: string[];
  title: string;
  root: MindMapNode;
  createdAt: string;
}

export async function generateMindMap(
  notebookId: string,
  sourceIds: string[],
  regenerate: boolean = false
): Promise<MindMapResult> {
  const sortedSourceIds = [...sourceIds].sort();
  const sourceIdsJson = JSON.stringify(sortedSourceIds);

  if (!regenerate) {
    const existing = await db.mindMap.findFirst({
      where: {
        notebookId,
        sourceIds: sourceIdsJson,
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return {
        id: existing.id,
        notebookId: existing.notebookId,
        sourceIds: JSON.parse(existing.sourceIds),
        title: existing.title,
        root: JSON.parse(existing.root),
        createdAt: existing.createdAt.toISOString(),
      };
    }
  }

  const chunks = await db.chunk.findMany({
    where: {
      sourceId: { in: sortedSourceIds },
      notebookId,
    },
    orderBy: { chunkIndex: "asc" },
  });

  if (chunks.length === 0) {
    throw new Error("No indexed content found for the selected sources. Please wait for indexing to complete.");
  }

  let sourceText = chunks.map((c) => c.text).join("\n\n");
  if (sourceText.length > 35000) {
    sourceText = sourceText.slice(0, 35000) + "... (truncated)";
  }

  const prompt = `
Create a comprehensive, balanced, hierarchical mind map (max depth 4, including the root) that organizes all key concepts and sub-topics of the following source material into a navigable tree.

SOURCE TEXT:
"""
${sourceText}
"""

Rules:
- Root node = overall topic/title (2-6 words).
- 4-6 top-level branches representing major themes/sections.
- Each top-level branch must have 2-5 child sub-branches; children may have 2-4 leaf children.
- Node labels MUST be short (2-6 words) — they are diagram labels, not full sentences.
- Every node (except root) MUST include a 1-2 sentence "summary" grounded in the source text, used for on-click tooltips.
- Create a rich, well-populated tree.

Return ONLY JSON matching schema:
{
  "root": {
    "label": string,
    "children": [
      {
        "label": string,
        "summary": string,
        "children": [
          {
            "label": string,
            "summary": string,
            "children": [
              {
                "label": string,
                "summary": string
              }
            ]
          }
        ]
      }
    ]
  }
}
`;

  let rootNode: MindMapNode | null = null;
  const maxAttempts = 2;

  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    try {
      const parsed = await generateJSON<{ root: any }>(
        prompt,
        "You are a precise mind map diagram generator. Always return valid JSON matching schema.",
        "gpt-4o"
      );

      if (!parsed.root || !parsed.root.label) {
        throw new Error("Response missing 'root' node");
      }

      rootNode = assignIds(parsed.root);
      break;
    } catch (err) {
      console.warn(`Mind Map generation attempt ${attempts} failed:`, (err as Error).message);
      if (attempts >= maxAttempts) {
        rootNode = generateFallbackMindMap(sourceText);
        break;
      }
    }
  }

  if (!rootNode) {
    throw new Error("Failed to generate mind map.");
  }

  if (regenerate) {
    await db.mindMap.deleteMany({
      where: { notebookId, sourceIds: sourceIdsJson },
    });
  }

  const savedMindMap = await db.mindMap.create({
    data: {
      notebookId,
      sourceIds: sourceIdsJson,
      title: rootNode.label,
      root: JSON.stringify(rootNode),
    },
  });

  return {
    id: savedMindMap.id,
    notebookId: savedMindMap.notebookId,
    sourceIds: sortedSourceIds,
    title: savedMindMap.title,
    root: rootNode,
    createdAt: savedMindMap.createdAt.toISOString(),
  };
}

export async function getMindMaps(notebookId: string): Promise<MindMapResult[]> {
  const records = await db.mindMap.findMany({
    where: { notebookId },
    orderBy: { createdAt: "desc" },
  });
  return records.map(record => ({
    id: record.id,
    notebookId: record.notebookId,
    sourceIds: JSON.parse(record.sourceIds),
    title: record.title,
    root: JSON.parse(record.root),
    createdAt: record.createdAt.toISOString(),
  }));
}

export async function deleteMindMap(mapId: string, notebookId: string): Promise<void> {
  await db.mindMap.deleteMany({
    where: { id: mapId, notebookId },
  });
}

function assignIds(node: any): MindMapNode {
  return {
    id: crypto.randomUUID(),
    label: String(node.label).trim(),
    summary: node.summary ? String(node.summary).trim() : undefined,
    children: (node.children || []).map((c: any) => assignIds(c)),
  };
}

function generateFallbackMindMap(text: string): MindMapNode {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 200);

  const branches: MindMapNode[] = [];
  const chunkSize = Math.max(1, Math.floor(sentences.length / 4));

  for (let b = 0; b < 4; b++) {
    const chunkSentences = sentences.slice(b * chunkSize, (b + 1) * chunkSize);
    if (chunkSentences.length === 0) continue;

    const mainSentence = chunkSentences[0];
    if (!mainSentence) continue;
    const words = mainSentence.split(" ");
    const mainTopic = words.slice(0, 4).join(" ").replace(/[^a-zA-Z0-9 ]/g, "") || `Section ${b + 1}`;

    const childNodes: MindMapNode[] = chunkSentences.slice(1, 4).map((s, idx) => {
      const subWords = s.split(" ");
      const subTopic = subWords.slice(0, 4).join(" ").replace(/[^a-zA-Z0-9 ]/g, "") || `Concept ${idx + 1}`;
      return {
        id: crypto.randomUUID(),
        label: subTopic,
        summary: s,
        children: []
      };
    });

    branches.push({
      id: crypto.randomUUID(),
      label: mainTopic,
      summary: mainSentence,
      children: childNodes
    });
  }

  if (branches.length === 0) {
    branches.push({
      id: crypto.randomUUID(),
      label: "Overview & Key Concepts",
      summary: "Primary concepts extracted from source material.",
      children: [
        {
          id: crypto.randomUUID(),
          label: "Core Principles",
          summary: text.slice(0, 150) || "Main themes from the document.",
          children: []
        }
      ]
    });
  }

  return {
    id: crypto.randomUUID(),
    label: "Document Mind Map",
    children: branches
  };
}
