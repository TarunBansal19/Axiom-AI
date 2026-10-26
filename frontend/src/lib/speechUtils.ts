/**
 * Cleans raw markdown and AI text before passing to the browser's SpeechSynthesis API.
 * Strips out machine artifacts, citations (CID tags, bracketed numbers), raw URLs,
 * and markdown symbols so the audio read-aloud sounds like smooth, natural human speech.
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return "";

  return text
    // Remove chunk citation tags like [CID:123], [cid:abc], [CID: chunk-id], [Source: ...], [Ref: ...]
    .replace(/\[\s*(?:CID|Source|Ref|Reference)[\s:][^\]]+\]/gi, "")
    .replace(/\[CID:[^\]]+\]/gi, "")
    // Remove parenthetical citation references like (CID: 123) or (Source: ...)
    .replace(/\(\s*(?:CID|Source|Ref|Reference)[\s:][^)]+\)/gi, "")
    // Remove bracketed citation numbers like [1], [2], [1, 2], [1, 2, 3]
    .replace(/\[\s*\d+\s*(?:,\s*\d+\s*)*\]/g, "")
    // Remove parenthetical citation numbers like (1) or (see 1)
    .replace(/\(\s*(?:CID:|\bsee\b)?\s*\d+\s*\)/gi, "")
    // Remove markdown code blocks ```code```
    .replace(/```[\s\S]*?```/g, "")
    // Inline code `code` -> code
    .replace(/`([^`]+)`/g, "$1")
    // Markdown links [title](url) -> title
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Raw URLs -> remove
    .replace(/https?:\/\/\S+/gi, "")
    // Markdown headers (# Header) -> Header
    .replace(/^#{1,6}\s+/gm, "")
    // Bold/italic/strikethrough: **text**, *text*, ~~text~~, __text__, _text_
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    // Markdown blockquotes (> Quote)
    .replace(/^>\s+/gm, "")
    // Bullet points (- Item or * Item or 1. Item) -> Item
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    // Trailing Grounded Sources footer if any
    .replace(/---\s*\n\s*\*?\*?Grounded Sources[\s\S]*$/gi, "")
    // Clean up empty parentheses/brackets left behind
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    // Clean up awkward spaces before punctuation (e.g. "factoring ." -> "factoring.")
    .replace(/[ \t]+([,.:;?!])/g, "$1")
    // Normalize spaces within lines
    .replace(/[ \t]{2,}/g, " ")
    // Normalize newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
