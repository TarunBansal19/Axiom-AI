import type { ExtractionResult, ExtractedSegment } from "./pdf";

export async function extractVtt(vttContent: string): Promise<ExtractionResult> {
  const lines = vttContent.split(/\r?\n/);
  const segments: ExtractedSegment[] = [];
  let cueIndex = 0;
  let currentStartTime = "";
  let currentTextLines: string[] = [];

  const timestampRegex = /(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() || "";
    if (line === "WEBVTT" || line === "" || line.startsWith("NOTE")) {
      continue;
    }

    const match = line.match(timestampRegex);
    if (match) {
      if (currentTextLines.length > 0 && currentStartTime) {
        cueIndex++;
        segments.push({
          text: currentTextLines.join(" ").trim(),
          location: {
            type: "vtt",
            cueIndex,
            startTime: currentStartTime,
          },
        });
        currentTextLines = [];
      }
      currentStartTime = match[1] || "";
    } else if (!isNaN(Number(line)) && lines[i + 1]?.match(timestampRegex)) {
      continue;
    } else {
      currentTextLines.push(line);
    }
  }

  if (currentTextLines.length > 0 && currentStartTime) {
    cueIndex++;
    segments.push({
      text: currentTextLines.join(" ").trim(),
      location: {
        type: "vtt",
        cueIndex,
        startTime: currentStartTime,
      },
    });
  }

  if (segments.length === 0 && vttContent.trim().length > 0) {
    segments.push({
      text: vttContent.trim(),
      location: { type: "vtt", cueIndex: 1, startTime: "00:00.000" },
    });
  }

  const fullText = segments.map((s) => s.text).join(" ");

  return {
    fullText,
    segments,
  };
}
