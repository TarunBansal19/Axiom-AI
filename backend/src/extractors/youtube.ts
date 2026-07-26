import youtubedl from "youtube-dl-exec";
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
    const res = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
      dumpJson: true,
      skipDownload: true,
      noWarnings: true,
    });

    const captions = (res as any).automatic_captions || (res as any).subtitles;
    if (!captions || Object.keys(captions).length === 0) {
      throw new Error("No captions found for this video");
    }

    // Prefer English, fallback to first available language
    const langKey = "en" in captions ? "en" : ("en-US" in captions ? "en-US" : Object.keys(captions)[0]);
    if (!langKey || !captions[langKey]) throw new Error("No caption language available");

    const captionSet: any[] = captions[langKey];
    const json3Url = captionSet.find((c: any) => c.ext === "json3")?.url;
    if (!json3Url) throw new Error("No JSON3 transcript format found");

    const transcriptRes = await fetch(json3Url);
    const json3Data: any = await transcriptRes.json();

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
      `Could not fetch YouTube transcript via yt-dlp for ${videoId}:`,
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
