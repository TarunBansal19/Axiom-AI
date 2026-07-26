import OpenAI from "openai";

const API_KEY = process.env.AICREDITS_API_KEY || process.env.OPENAI_API_KEY;
const BASE_URL = process.env.AICREDITS_BASE_URL || "https://api.aicredits.in/v1";

let openaiClient: OpenAI | null = null;
if (API_KEY) {
  openaiClient = new OpenAI({
    apiKey: API_KEY,
    baseURL: BASE_URL,
    timeout: 60000, // 60 seconds timeout
  });
}

function createDeterministicEmbedding(text: string, dim: number = 1536): number[] {
  const vec = new Array(dim).fill(0);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  for (let i = 0; i < dim; i++) {
    const val = Math.sin(hash + i) * 10000;
    vec[i] = val - Math.floor(val);
  }
  let sumSq = 0;
  for (let i = 0; i < dim; i++) sumSq += vec[i] * vec[i];
  const norm = Math.sqrt(sumSq) || 1;
  return vec.map((v) => v / norm);
}

export async function getEmbedding(text: string): Promise<number[]> {
  if (openaiClient) {
    try {
      const response = await openaiClient.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      });
      const emb = response.data[0]?.embedding;
      if (emb) return emb;
    } catch (err) {
      console.warn("OpenAI embedding call failed, falling back:", (err as Error).message);
    }
  }

  // Fallback deterministic embeddings for local dev/test when key is not set
  return createDeterministicEmbedding(text);
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (openaiClient) {
    try {
      const response = await openaiClient.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
      });
      // Ensure the returned array matches the input order by sorting based on index
      const sortedData = response.data.sort((a, b) => a.index - b.index);
      return sortedData.map(d => d.embedding);
    } catch (err) {
      console.warn("OpenAI batch embedding call failed, falling back:", (err as Error).message);
    }
  }

  // Fallback deterministic embeddings for local dev/test when key is not set
  return texts.map(t => createDeterministicEmbedding(t));
}

export async function generateText(
  prompt: string,
  systemInstruction?: string,
  model: string = "gpt-4o"
): Promise<string> {
  if (openaiClient) {
    try {
      const response = await openaiClient.chat.completions.create({
        model,
        messages: [
          ...(systemInstruction ? [{ role: "system" as const, content: systemInstruction }] : []),
          { role: "user" as const, content: prompt },
        ],
      });
      const content = response.choices[0]?.message?.content;
      if (content) return content;
    } catch (err) {
      console.warn(`OpenAI Chat Completions (${model}) failed, trying Responses API fallback:`, (err as Error).message);
      try {
        const response = await (openaiClient as any).responses.create({
          model,
          input: prompt,
          ...(systemInstruction ? { instructions: systemInstruction } : {}),
        });

        if (response?.output_text) return response.output_text;
        if (response?.output?.[0]?.text) return response.output[0].text;
        if (response?.choices?.[0]?.message?.content) return response.choices[0].message.content;
      } catch (respErr) {
        console.warn(`OpenAI Responses API fallback (${model}) failed:`, (respErr as Error).message);
      }
    }
  }

  throw new Error("LLM API call failed or no API key provided.");
}

export async function generateJSON<T = any>(
  prompt: string,
  systemInstruction?: string,
  model: string = "gpt-4o"
): Promise<T> {
  if (openaiClient) {
    try {
      const response = await openaiClient.chat.completions.create({
        model,
        messages: [
          ...(systemInstruction ? [{ role: "system" as const, content: systemInstruction }] : []),
          { role: "user" as const, content: prompt },
        ],
        response_format: { type: "json_object" },
      });
      const content = response.choices[0]?.message?.content;
      if (content) {
        let jsonStr = content.trim();
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch && jsonMatch[1]) {
          jsonStr = jsonMatch[1].trim();
        }
        const objMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (objMatch) {
          jsonStr = objMatch[0];
        }
        return JSON.parse(jsonStr) as T;
      }
    } catch (err) {
      console.warn(`generateJSON Chat Completions (${model}) failed:`, (err as Error).message);
    }
  }

  // Fallback if client or structured call fails: try generateText and parse JSON
  const rawText = await generateText(
    prompt + "\n\nIMPORTANT: Return ONLY valid JSON.",
    systemInstruction,
    model
  );
  let jsonStr = rawText.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch && jsonMatch[1]) {
    jsonStr = jsonMatch[1].trim();
  }
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) {
    jsonStr = objMatch[0];
  }
  return JSON.parse(jsonStr) as T;
}

