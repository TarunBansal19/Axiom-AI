import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import type { ExtractionResult } from "./pdf";

export async function extractUrl(url: string): Promise<ExtractionResult> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch URL ${url}: ${res.statusText}`);
  }
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const fullText = article?.textContent ? article.textContent.trim() : dom.window.document.body.textContent?.trim() || "";
  const title = article?.title || dom.window.document.title || url;

  return {
    fullText,
    title,
    segments: [
      {
        text: fullText,
        location: { type: "url", charStart: 0, charEnd: fullText.length },
      },
    ],
  };
}
