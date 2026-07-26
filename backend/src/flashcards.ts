import { db } from "./db";
import { generateJSON, generateText } from "./llm";
import crypto from "crypto";

export interface FlashcardCard {
  id: string;
  question: string;
  answer: string;
}

export interface FlashcardDeckResult {
  id: string;
  notebookId: string;
  sourceIds: string[];
  title: string;
  cards: FlashcardCard[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Generate a flashcard deck from notebook sources, or return cached deck.
 */
export async function generateFlashcardDeck(
  notebookId: string,
  sourceIds: string[],
  count: number = 15,
  regenerate: boolean = false
): Promise<FlashcardDeckResult> {
  const sortedSourceIds = [...sourceIds].sort();
  const sourceIdsJson = JSON.stringify(sortedSourceIds);

  // Check for cached deck if not regenerating
  if (!regenerate) {
    const existing = await db.flashcardDeck.findFirst({
      where: {
        notebookId,
        sourceIds: sourceIdsJson,
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return parseDeckFromDb(existing);
    }
  }

  // Fetch source text from chunks
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

  const sourceText = chunks.map((c) => c.text).join("\n\n");

  const effectiveCount = Math.max(5, Math.min(count, 30));

  // Get notebook name for title
  const notebook = await db.notebook.findUnique({ where: { id: notebookId } });
  const title = `${notebook?.name || "Notebook"} Flashcards`;

  // Truncate source text to fit context window (~30k chars)
  const truncatedSource = sourceText.slice(0, 30000);

  const prompt = `You are generating study flashcards from the following source material.

SOURCE TEXT:
"""
${truncatedSource}
"""

Generate EXACTLY ${effectiveCount} flashcards that test understanding of the KEY concepts, definitions,
numbers, and mechanisms found SPECIFICALLY in this source material. Each flashcard must directly relate
to content explicitly stated in the text above.

Rules:
- Questions must be specific and answerable from the source text alone.
- Answers should be 1-3 sentences, self-contained, accurate to the source.
- Cover different topics across the material — don't cluster on one section.
- Avoid yes/no questions and overly generic questions.
- Do NOT reference "the paper", "this document", or "the author" in answers.

Return ONLY valid JSON matching this exact schema:
{
  "cards": [
    { "question": "string", "answer": "string" }
  ]
}`;

  let cards: FlashcardCard[] = [];
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const parsed = await generateJSON<{ cards: Array<{ question: string; answer: string }> }>(
        prompt,
        "You are a precise study material generator. You MUST return valid JSON only, no markdown, no explanation. Generate flashcards that are directly grounded in the provided source text.",
        "gpt-4.1"
      );

      if (!parsed.cards || !Array.isArray(parsed.cards)) {
        throw new Error("Response missing 'cards' array");
      }

      cards = parsed.cards
        .filter((c: any) => c.question && c.answer)
        .map((c: any) => ({
          id: crypto.randomUUID(),
          question: String(c.question).trim(),
          answer: String(c.answer).trim(),
        }));

      if (cards.length >= Math.ceil(effectiveCount * 0.5)) {
        break;
      }

      console.warn(`Generated only ${cards.length} cards (need ${Math.ceil(effectiveCount * 0.5)}), retrying...`);
    } catch (err) {
      console.warn(`Flashcard generation attempt ${attempts} failed:`, (err as Error).message);
      if (attempts >= maxAttempts) {
        if (cards.length > 0) {
          break; // Use whatever we got
        }
        cards = generateFallbackCardsFromText(sourceText, effectiveCount);
        break;
      }
    }
  }

  // Deduplicate by question similarity (simple normalized comparison)
  cards = deduplicateCards(cards);

  const cardsJson = JSON.stringify(cards);

  // If regenerating, delete the old deck first
  if (regenerate) {
    await db.flashcardDeck.deleteMany({
      where: { notebookId, sourceIds: sourceIdsJson },
    });
  }

  // Persist to DB
  const deck = await db.flashcardDeck.create({
    data: {
      notebookId,
      sourceIds: sourceIdsJson,
      title,
      cards: cardsJson,
    },
  });

  return parseDeckFromDb(deck);
}

/**
 * Get existing flashcard deck(s) for a notebook.
 */
export async function getFlashcardDecks(notebookId: string): Promise<FlashcardDeckResult[]> {
  const decks = await db.flashcardDeck.findMany({
    where: { notebookId },
    orderBy: { createdAt: "desc" },
  });

  return decks.map(parseDeckFromDb);
}

/**
 * Delete a flashcard deck.
 */
export async function deleteFlashcardDeck(deckId: string, notebookId: string): Promise<void> {
  await db.flashcardDeck.delete({
    where: { id: deckId, notebookId },
  });
}

/**
 * Generate a deeper explanation for a flashcard Q/A pair.
 */
export async function explainFlashcard(question: string, answer: string): Promise<string> {
  const prompt = `A student is studying with flashcards and wants a deeper explanation.

Flashcard Question: "${question}"
Flashcard Answer: "${answer}"

Provide a clear, detailed explanation (3-5 sentences) that helps the student understand WHY this answer is correct, including any relevant context, examples, or underlying principles. Be educational and concise.`;

  const explanation = await generateText(
    prompt,
    "You are a patient, knowledgeable tutor. Explain concepts clearly with examples.",
    "gpt-4.1"
  );

  return explanation;
}

// --- Helpers ---

function parseDeckFromDb(deck: any): FlashcardDeckResult {
  let cards: FlashcardCard[];
  try {
    cards = JSON.parse(deck.cards);
  } catch {
    cards = [];
  }

  let sourceIds: string[];
  try {
    sourceIds = JSON.parse(deck.sourceIds);
  } catch {
    sourceIds = [];
  }

  return {
    id: deck.id,
    notebookId: deck.notebookId,
    sourceIds,
    title: deck.title,
    cards,
    createdAt: deck.createdAt.toISOString(),
    updatedAt: deck.updatedAt.toISOString(),
  };
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeText(a).split(" "));
  const setB = new Set(normalizeText(b).split(" "));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

function deduplicateCards(cards: FlashcardCard[]): FlashcardCard[] {
  const result: FlashcardCard[] = [];
  for (const card of cards) {
    const isDuplicate = result.some(
      (existing) => jaccardSimilarity(existing.question, card.question) > 0.8
    );
    if (!isDuplicate) {
      result.push(card);
    }
  }
  return result;
}

function generateFallbackCardsFromText(text: string, count: number): FlashcardCard[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 250);

  const cards: FlashcardCard[] = [];
  for (let i = 0; i < Math.min(sentences.length, count); i++) {
    const sentence = sentences[i];
    if (!sentence) continue;
    const words = sentence.split(" ");
    const keyTerm = words.find((w) => w.length > 5 && !/^(the|this|that|these|those|which|where|when|with|from|have|been|will|would|could|should)$/i.test(w)) || "this concept";
    const cleanTerm = keyTerm.replace(/[^a-zA-Z0-9]/g, "");

    cards.push({
      id: crypto.randomUUID(),
      question: `What is the significance or definition of ${cleanTerm} in this context?`,
      answer: sentence,
    });
  }

  if (cards.length === 0) {
    cards.push({
      id: crypto.randomUUID(),
      question: "What key information is presented in these sources?",
      answer: text.slice(0, 200) || "The source material covers the core topics outlined in your research document.",
    });
  }

  return cards;
}
