import { Innertube } from "youtubei.js";
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
    const yt = await Innertube.create({ generate_session_locally: true });
    const info = await yt.getInfo(videoId);
    const captionTracks = info.captions?.caption_tracks;

    if (!captionTracks || captionTracks.length === 0) {
      throw new Error(`No caption tracks found for video ${videoId}`);
    }

    // Prefer English, otherwise first available
    const track =
      captionTracks.find((t: any) => t.language_code === "en") ||
      captionTracks.find((t: any) => t.language_code === "en-US") ||
      captionTracks[0];

    if (!track?.base_url) {
      throw new Error("Caption track has no base_url");
    }

    // Fetch JSON3 format (structured with timestamps)
    const json3Res = await fetch(track.base_url + "&fmt=json3");
    const json3Data: any = await json3Res.json();

    if (json3Data.events) {
      for (const event of json3Data.events) {
        if (!event.segs) continue;
        const text = event.segs
          .map((s: any) => s.utf8 ?? "")
          .join("")
          .replace(/\n/g, " ")
          .trim();
        if (!text) continue;
        transcriptItems.push({
          text,
          offset: (event.tStartMs || 0) / 1000,
          duration: (event.dDurationMs || 0) / 1000,
        });
      }
    }

    if (transcriptItems.length === 0) {
      throw new Error("Transcript parsed but no text segments found");
    }
  } catch (err) {
    console.warn(
      `Could not fetch YouTube transcript for ${videoId}:`,
      (err as Error).message
    );
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
