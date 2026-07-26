import type { ExtractedSegment } from "./extractors/pdf";

export interface PreparedChunk {
  text: string;
  chunkIndex: number;
  location: any;
}

export function createChunks(sourceType: string, segments: ExtractedSegment[], chunkSizeChars = 1200, overlapChars = 150): PreparedChunk[] {
  const chunks: PreparedChunk[] = [];
  let chunkIndex = 0;

  if (sourceType === "YOUTUBE" || sourceType === "VTT" || sourceType === "youtube_playlist" || sourceType === "YOUTUBE_PLAYLIST") {
    let currentText = "";
    let firstLoc: any = null;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg) continue;
      if (!firstLoc) firstLoc = seg.location;
      currentText += (currentText ? " " : "") + seg.text;

      if (currentText.length >= chunkSizeChars || i === segments.length - 1) {
        chunks.push({
          text: currentText,
          chunkIndex: chunkIndex++,
          location: firstLoc || seg.location,
        });
        currentText = "";
        firstLoc = null;
      }
    }
    return chunks;
  }

  // Prose types: PDF, TEXT, URL
  for (const seg of segments) {
    if (!seg) continue;
    const text = seg.text;
    if (text.length <= chunkSizeChars) {
      chunks.push({
        text,
        chunkIndex: chunkIndex++,
        location: seg.location,
      });
      continue;
    }

    let start = 0;
    while (start < text.length) {
      let end = start + chunkSizeChars;
      if (end < text.length) {
        const lastSpace = text.lastIndexOf(" ", end);
        if (lastSpace > start + chunkSizeChars / 2) {
          end = lastSpace;
        }
      } else {
        end = text.length;
      }

      const chunkText = text.slice(start, end).trim();
      if (chunkText.length > 0) {
        let loc = { ...seg.location };
        if (loc.type === "text" || loc.type === "url") {
          loc = { type: loc.type, charStart: start, charEnd: end };
        }
        chunks.push({
          text: chunkText,
          chunkIndex: chunkIndex++,
          location: loc,
        });
      }

      start = end - overlapChars;
      if (start >= text.length - overlapChars) break;
    }
  }

  return chunks;
}
