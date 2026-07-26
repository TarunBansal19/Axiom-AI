import pdfParse from "pdf-parse";

export interface ExtractedSegment {
  text: string;
  location: any;
}

export interface ExtractionResult {
  fullText: string;
  title?: string;
  segments: ExtractedSegment[];
}

export async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const data = await pdfParse(buffer);
  const totalPages = data.numpages;
  const fullText = data.text || "";

  const pagesText = fullText.split(/\f|\n(?=Page \d+)/i);
  const segments: ExtractedSegment[] = [];

  if (pagesText.length >= totalPages && totalPages > 1) {
    pagesText.forEach((pageContent, idx) => {
      if (pageContent.trim().length > 0) {
        segments.push({
          text: pageContent.trim(),
          location: { type: "pdf", page: idx + 1 },
        });
      }
    });
  } else {
    const charsPerPage = Math.ceil(fullText.length / Math.max(1, totalPages));
    for (let p = 0; p < totalPages; p++) {
      const pageText = fullText.slice(p * charsPerPage, (p + 1) * charsPerPage).trim();
      if (pageText.length > 0) {
        segments.push({
          text: pageText,
          location: { type: "pdf", page: p + 1 },
        });
      }
    }
  }

  if (segments.length === 0 && fullText.trim().length > 0) {
    segments.push({
      text: fullText.trim(),
      location: { type: "pdf", page: 1 },
    });
  }

  return {
    fullText,
    title: data.info?.Title || undefined,
    segments,
  };
}
