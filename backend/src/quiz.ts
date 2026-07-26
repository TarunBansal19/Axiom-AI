import { db } from "./db";
import { generateJSON, generateText } from "./llm";
import crypto from "crypto";

export interface QuizOption {
  id: string;
  label: string;
  rationale: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
  correctOptionId: string;
}

export interface QuizResult {
  id: string;
  notebookId: string;
  sourceIds: string[];
  title: string;
  questions: QuizQuestion[];
  createdAt: string;
}

export async function generateQuiz(
  notebookId: string,
  sourceIds: string[],
  questionCount: number = 10,
  regenerate: boolean = false
): Promise<QuizResult> {
  const sortedSourceIds = [...sourceIds].sort();
  const sourceIdsJson = JSON.stringify(sortedSourceIds);

  if (!regenerate) {
    const existing = await db.quiz.findFirst({
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
        questions: JSON.parse(existing.questions),
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
  if (sourceText.length > 40000) {
    sourceText = sourceText.slice(0, 40000) + "... (truncated)";
  }

  const effectiveCount = Math.max(5, Math.min(questionCount, 25));

  const prompt = `
Generate a ${effectiveCount}-question multiple-choice quiz from the following source material.

SOURCE TEXT:
"""
${sourceText}
"""

Rules:
- Generate EXACTLY ${effectiveCount} distinct multiple-choice questions testing key concepts, definitions, mechanisms, and findings in the text.
- Each question must have exactly 4 options, only one correct.
- Distractors must be plausible (based on real details/numbers/near-misses from the source), not obviously wrong.
- For EVERY option (correct and incorrect), write a one-sentence rationale explaining why it is right or wrong, grounded in the source text. Do not just say "incorrect" — explain why.
- Vary question types: definitions, mechanisms, numeric details, cause/effect, comparisons.

Return ONLY JSON matching schema:
{
  "questions": [
    {
      "prompt": "string",
      "options": [
        { "label": "string", "rationale": "string", "isCorrect": boolean }
      ]
    }
  ]
}
`;

  let questions: QuizQuestion[] = [];
  const maxAttempts = 2;

  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    try {
      const parsed = await generateJSON<{ questions: any[] }>(
        prompt,
        "You are a precise study material generator. Always return valid JSON matching schema.",
        "gpt-4o"
      );

      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        throw new Error("Response missing 'questions' array");
      }

      questions = [];
      for (const q of parsed.questions) {
        if (!q.prompt || !Array.isArray(q.options) || q.options.length !== 4) continue;
        
        const rawOptions = q.options.map((opt: any) => ({
          label: String(opt.label).trim(),
          rationale: String(opt.rationale).trim(),
          isCorrect: !!opt.isCorrect,
        }));

        // Shuffle options server-side
        for (let i = rawOptions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rawOptions[i], rawOptions[j]] = [rawOptions[j], rawOptions[i]];
        }

        const optionLetters = ['A', 'B', 'C', 'D'];
        let correctOptionId = 'A';

        const finalOptions: QuizOption[] = rawOptions.map((opt: { label: string; rationale: string; isCorrect: boolean }, idx: number) => {
          const letter = optionLetters[idx] || 'A';
          if (opt.isCorrect) {
            correctOptionId = letter;
          }
          return {
            id: letter,
            label: opt.label,
            rationale: opt.rationale,
          };
        });

        questions.push({
          id: crypto.randomUUID(),
          prompt: String(q.prompt).trim(),
          options: finalOptions,
          correctOptionId,
        });
      }

      if (questions.length >= Math.ceil(effectiveCount * 0.5)) {
        break;
      }
    } catch (err) {
      console.warn(`Quiz generation attempt ${attempts} failed:`, (err as Error).message);
      if (attempts >= maxAttempts) {
        if (questions.length > 0) {
          break; // Use whatever we got
        }
        questions = generateFallbackQuiz(sourceText, effectiveCount);
        break;
      }
    }
  }

  if (regenerate) {
    await db.quiz.deleteMany({
      where: { notebookId, sourceIds: sourceIdsJson },
    });
  }

  const savedQuiz = await db.quiz.create({
    data: {
      notebookId,
      sourceIds: sourceIdsJson,
      title: `${questions.length}-Question Quiz`,
      questions: JSON.stringify(questions),
    },
  });

  return {
    id: savedQuiz.id,
    notebookId: savedQuiz.notebookId,
    sourceIds: sortedSourceIds,
    title: savedQuiz.title,
    questions: questions,
    createdAt: savedQuiz.createdAt.toISOString(),
  };
}

export async function getQuizzes(notebookId: string): Promise<QuizResult[]> {
  const records = await db.quiz.findMany({
    where: { notebookId },
    orderBy: { createdAt: "desc" },
  });
  return records.map(record => ({
    id: record.id,
    notebookId: record.notebookId,
    sourceIds: JSON.parse(record.sourceIds),
    title: record.title,
    questions: JSON.parse(record.questions),
    createdAt: record.createdAt.toISOString(),
  }));
}

export async function deleteQuiz(quizId: string, notebookId: string): Promise<void> {
  await db.quiz.deleteMany({
    where: { id: quizId, notebookId },
  });
}

function generateFallbackQuiz(text: string, count: number): QuizQuestion[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 200);

  const questions: QuizQuestion[] = [];
  for (let i = 0; i < Math.min(sentences.length, count); i++) {
    const sentence = sentences[i];
    if (!sentence) continue;
    
    questions.push({
      id: crypto.randomUUID(),
      prompt: "Based on the text: " + sentence.slice(0, 50) + "...",
      correctOptionId: 'A',
      options: [
        { id: 'A', label: "True", rationale: "This matches the information given in the source." },
        { id: 'B', label: "False", rationale: "This contradicts the source material." },
        { id: 'C', label: "Not Mentioned", rationale: "The source does not explicitly discuss this." },
        { id: 'D', label: "Inconclusive", rationale: "The source is ambiguous on this point." }
      ]
    });
  }

  if (questions.length === 0) {
    questions.push({
      id: crypto.randomUUID(),
      prompt: "What is the main topic of the sources?",
      correctOptionId: 'A',
      options: [
        { id: 'A', label: "The core subject of the documents", rationale: "This summarizes the main theme." },
        { id: 'B', label: "An unrelated topic", rationale: "This is a distractor." },
        { id: 'C', label: "A minor detail", rationale: "This was mentioned but is not the main topic." },
        { id: 'D', label: "None of the above", rationale: "Incorrect." }
      ]
    });
  }

  return questions;
}
