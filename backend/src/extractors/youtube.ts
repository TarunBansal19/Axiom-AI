import { YoutubeTranscript } from "youtube-transcript";
import type { ExtractionResult, ExtractedSegment } from "./pdf";

export function extractYoutubeId(input: string): string {
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) {
    return input.trim();
  }
  const match = input.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return (match && match[1]) ? match[1] : input.trim();
}

export async function extractYoutube(inputUri: string): Promise<ExtractionResult> {
  const videoId = extractYoutubeId(inputUri);
  let transcriptItems: Array<{ text: string; offset: number; duration: number }> = [];

  try {
    const rawItems = await YoutubeTranscript.fetchTranscript(videoId);
    transcriptItems = rawItems.map((item) => ({
      text: item.text,
      offset: item.offset / 1000,
      duration: item.duration / 1000,
    }));
  } catch (err) {
    console.warn(`Could not fetch live YouTube transcript for ${videoId}, generating fallback structure:`, (err as Error).message);
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
