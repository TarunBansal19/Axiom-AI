import React, { useEffect, useState } from "react";
import { X, Bookmark, ExternalLink } from "lucide-react";
import { ChunkDetails, SourceType } from "./types";

interface SourceViewerProps {
  chunkId: string | null;
  onClose: () => void;
}

export const SourceViewer: React.FC<SourceViewerProps> = ({ chunkId, onClose }) => {
  const [chunkDetails, setChunkDetails] = useState<ChunkDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chunkId) {
      setChunkDetails(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    fetch(`/api/chunks/${chunkId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to resolve citation chunk");
        return res.json();
      })
      .then((data: ChunkDetails) => {
        setChunkDetails(data);
      })
      .catch((err) => {
        setError((err as Error).message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [chunkId]);

  if (!chunkId) return null;

  const renderSourceContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-64 text-xs text-muted-foreground animate-pulse">
          Loading source viewer...
        </div>
      );
    }

    if (error || !chunkDetails) {
      return (
        <div className="p-6 text-center text-xs text-destructive">
          {error || "Could not load citation source."}
        </div>
      );
    }

    const { location, text, source } = chunkDetails;
    const sourceType: SourceType = source.type;

    if (sourceType === "PDF") {
      const pageNum = location?.page || 1;
      return (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs flex items-center justify-between text-primary">
            <span className="font-semibold">PDF Page {pageNum}</span>
            <span className="text-[10px] text-muted-foreground">Location: Page {pageNum}</span>
          </div>

          <div className="rounded-xl overflow-hidden border border-border bg-muted/30">
            <iframe
              className="w-full h-[420px]"
              src={`/api/sources/${source.id}/file#page=${pageNum}`}
              title={`${source.title || "PDF"} — page ${pageNum}`}
            />
          </div>

          <div className="p-4 rounded-xl bg-card border border-border text-xs font-mono text-foreground leading-relaxed">
            <div className="text-[10px] text-primary font-sans uppercase font-bold mb-2">
              Cited Segment
            </div>
            {text}
          </div>
        </div>
      );
    }

    if (sourceType === "YOUTUBE") {
      const startSec = location?.startSeconds || 0;
      let videoId = source.originalUri;
      const match = videoId.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      if (match) videoId = match[1];

      return (
        <div className="space-y-4">
          <div className="aspect-video rounded-xl overflow-hidden border border-border bg-black shadow-lg">
            <iframe
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${videoId}?start=${startSec}`}
              title="YouTube Source Player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>

          <div className="p-3 rounded-xl bg-card border border-border text-xs space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-[11px]">
              <span>Timestamp</span>
              <span className="text-primary font-semibold">{startSec}s</span>
            </div>
            <p className="text-foreground leading-relaxed font-sans pt-1 border-t border-border">
              "{text}"
            </p>
          </div>
        </div>
      );
    }

    if (sourceType === "TEXT" || sourceType === "URL") {
      const charStart = location?.charStart || 0;
      const charEnd = location?.charEnd || text.length;

      return (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-card border border-border text-xs flex items-center justify-between text-muted-foreground">
            <span>Offsets: [{charStart} - {charEnd}]</span>
            {source.originalUri.startsWith("http") && (
              <a
                href={source.originalUri}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline flex items-center gap-1 text-[11px]"
              >
                Open Original <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="p-4 rounded-xl bg-card border border-primary/30 text-xs font-mono text-foreground leading-relaxed">
            <span className="bg-primary/20 text-foreground px-1 py-0.5 rounded border border-primary/40">
              {text}
            </span>
          </div>
        </div>
      );
    }

    if (sourceType === "VTT") {
      const cueIndex = location?.cueIndex || 1;
      const startTime = location?.startTime || "00:00.000";

      return (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs flex items-center justify-between text-amber-300">
            <span>Cue #{cueIndex}</span>
            <span className="font-semibold">{startTime}</span>
          </div>

          <div className="p-4 rounded-xl bg-card border border-border text-xs font-mono text-foreground leading-relaxed">
            <div className="text-[10px] text-amber-400 font-sans uppercase font-bold mb-2">
              Transcript Cue Text
            </div>
            {text}
          </div>
        </div>
      );
    }

    return <div className="text-xs text-foreground">{text}</div>;
  };

  return (
    <>
      <div
        className="fixed inset-0 top-12 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed top-12 right-0 bottom-0 w-[420px] z-50 bg-card border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        <div className="p-4 border-b border-border flex items-center justify-between bg-card shrink-0">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <Bookmark className="w-4 h-4 text-primary shrink-0" />
            <h3 className="text-xs font-bold text-foreground truncate">
              {chunkDetails?.source.title || "Citation Source"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition"
            aria-label="Close source viewer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {renderSourceContent()}
        </div>
      </div>
    </>
  );
};
