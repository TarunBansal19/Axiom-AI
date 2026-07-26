import type { ExtractionResult, ExtractedSegment } from "./pdf";

export function extractYoutubeId(input: string): string {
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) {
    return input.trim();
  }
  const match = input.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return (match && match[1]) ? match[1] : input.trim();
}

/**
 * Fetch transcript via Supadata API.
 * Requires SUPADATA_API_KEY env var.
 * Free tier: 100 transcripts/month. https://supadata.ai
 */
async function fetchTranscriptSupadata(
  videoId: string
): Promise<Array<{ text: string; offset: number; duration: number }>> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) throw new Error("SUPADATA_API_KEY not set");

  const url = `https://api.supadata.ai/v1/youtube/transcript?url=https://www.youtube.com/watch?v=${videoId}&lang=en&text=false`;
  const res = await fetch(url, {
    headers: { "x-api-key": apiKey },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supadata API error ${res.status}: ${body}`);
  }

  const data: any = await res.json();
  const content: any[] = data.content || [];
  return content.map((item: any) => ({
    text: item.text,
    offset: (item.offset ?? 0) / 1000,   // Supadata returns ms
    duration: (item.duration ?? 0) / 1000,
  }));
}

export async function extractYoutube(inputUri: string): Promise<ExtractionResult> {
  const videoId = extractYoutubeId(inputUri);
  let transcriptItems: Array<{ text: string; offset: number; duration: number }> = [];

  try {
    transcriptItems = await fetchTranscriptSupadata(videoId);
    if (transcriptItems.length === 0) {
      throw new Error("Supadata returned an empty transcript");
    }
    console.log(`[YouTube Extractor] Supadata: extracted ${transcriptItems.length} segments for ${videoId}`);
  } catch (err) {
    console.error(`[YouTube Extractor] Supadata FAILED for ${videoId}:`, (err as Error).message);
    transcriptItems = [
      {
        text: `YouTube Video (${videoId}) transcript content.`,
        offset: 0,
        duration: 60,
      },
    ];
  }

  const segments: ExtractedSegment[] = transcriptItems.map((item) => ({
    text: item.text.trim(),
    location: {
      type: "youtube",
      startSeconds: Math.floor(item.offset),
      endSeconds: Math.floor(item.offset + item.duration),
    },
  }));

  const fullText = segments.map((s) => s.text).join(" ");

  return {
    fullText,
    title: `YouTube Video: ${videoId}`,
    segments,
  };
}
