import type { ExtractionResult } from "./pdf";

export async function extractText(content: string): Promise<ExtractionResult> {
  const fullText = content.trim();
  return {
    fullText,
    segments: [
      {
        text: fullText,
        location: { type: "text", charStart: 0, charEnd: fullText.length },
      },
    ],
  };
}
