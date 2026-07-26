import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Youtube, Globe, FileCode, Subtitles, X, Upload } from "lucide-react";
import { SourceType } from "./types";

interface AddSourceModalProps {
  notebookId: string;
  isOpen: boolean;
  onClose: () => void;
  onSourceAdded: () => void;
}

export const AddSourceModal: React.FC<AddSourceModalProps> = ({
  notebookId,
  isOpen,
  onClose,
  onSourceAdded,
}) => {
  const [selectedType, setSelectedType] = useState<SourceType | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [textContentInput, setTextContentInput] = useState("");
  const [fileInput, setFileInput] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const tiles: Array<{ type: SourceType; title: string; desc: string; icon: React.ReactNode }> = [
    {
      type: "PDF",
      title: "PDF Document",
      desc: "Upload research papers, reports, or articles",
      icon: <FileText className="w-6 h-6 text-red-400" />,
    },
    {
      type: "YOUTUBE",
      title: "YouTube Video",
      desc: "Import video transcripts & timestamps",
      icon: <Youtube className="w-6 h-6 text-rose-500" />,
    },
    {
      type: "YOUTUBE_PLAYLIST",
      title: "YouTube Playlist",
      desc: "Import multiple videos to generate a Roadmap",
      icon: <Youtube className="w-6 h-6 text-purple-500" />,
    },
    {
      type: "URL",
      title: "Web Link",
      desc: "Extract text snapshot from any webpage",
      icon: <Globe className="w-6 h-6 text-blue-400" />,
    },
    {
      type: "TEXT",
      title: "Copied Text",
      desc: "Paste notes, markdown, or plain text",
      icon: <FileCode className="w-6 h-6 text-emerald-400" />,
    },
    {
      type: "VTT",
      title: "VTT Subtitle",
      desc: "Upload video caption / transcript files",
      icon: <Subtitles className="w-6 h-6 text-amber-400" />,
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) return;
    setIsSubmitting(true);

    try {
      if (selectedType === "PDF" || selectedType === "VTT") {
        if (!fileInput) {
          alert("Please select a file to upload");
          setIsSubmitting(false);
          return;
        }
        const formData = new FormData();
        formData.append("notebookId", notebookId);
        formData.append("type", selectedType);
        formData.append("file", fileInput);
        if (titleInput) formData.append("title", titleInput);

        const res = await fetch("/api/sources", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const payload: any = {
          notebookId,
          type: selectedType,
          title: titleInput || undefined,
        };

        if (selectedType === "TEXT") {
          payload.textContent = textContentInput;
          payload.originalUri = titleInput || "Copied Text";
        } else if (selectedType === "URL" || selectedType === "YOUTUBE" || selectedType === "YOUTUBE_PLAYLIST") {
          payload.originalUri = urlInput;
        }

        const res = await fetch("/api/sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
      }

      onSourceAdded();
      handleReset();
      onClose();
    } catch (err) {
      alert(`Failed to add source: ${(err as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedType(null);
    setUrlInput("");
    setTitleInput("");
    setTextContentInput("");
    setFileInput(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">Add Knowledge Source</h2>
            <p className="text-xs text-muted-foreground">Select a source type to ingest into this notebook</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => {
              handleReset();
              onClose();
            }}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6">
          {!selectedType ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tiles.map((tile) => (
                <button
                  key={tile.type}
                  onClick={() => setSelectedType(tile.type)}
                  className="flex items-start gap-3.5 p-4 rounded-xl bg-background border border-border hover:border-primary/50 hover:bg-accent transition text-left group"
                >
                  <div className="p-2.5 rounded-lg bg-card group-hover:scale-110 transition-transform">
                    {tile.icon}
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-foreground group-hover:text-primary">
                      {tile.title}
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{tile.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-border">
                <button
                  type="button"
                  onClick={() => setSelectedType(null)}
                  className="text-xs text-primary hover:underline"
                >
                  ← Change Type
                </button>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs font-semibold text-foreground">{selectedType} Ingestion</span>
              </div>

              {/* Title input */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Source Title (Optional)</label>
                <input
                  type="text"
                  placeholder="Custom name for this source..."
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              {/* File upload for PDF or VTT */}
              {(selectedType === "PDF" || selectedType === "VTT") && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Upload {selectedType} File
                  </label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-6 cursor-pointer bg-background transition">
                    <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                    <span className="text-xs text-foreground">
                      {fileInput ? fileInput.name : `Click or drag ${selectedType} file here`}
                    </span>
                    <input
                      type="file"
                      accept={selectedType === "PDF" ? ".pdf" : ".vtt"}
                      onChange={(e) => setFileInput(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {/* URL input for URL or YouTube */}
              {(selectedType === "URL" || selectedType === "YOUTUBE" || selectedType === "YOUTUBE_PLAYLIST") && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    {selectedType === "YOUTUBE_PLAYLIST" ? "Playlist URL" : selectedType === "YOUTUBE" ? "YouTube URL" : "Web URL"}
                  </label>
                  <input
                    type="url"
                    required
                    placeholder={
                      selectedType === "YOUTUBE_PLAYLIST"
                        ? "https://youtube.com/playlist?list=..."
                        : selectedType === "YOUTUBE"
                        ? "https://www.youtube.com/watch?v=..."
                        : "https://example.com/article"
                    }
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              {/* Text content input */}
              {selectedType === "TEXT" && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Text Content</label>
                  <textarea
                    required
                    rows={6}
                    placeholder="Paste text, notes, or documentation snippet here..."
                    value={textContentInput}
                    onChange={(e) => setTextContentInput(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-primary font-mono"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    handleReset();
                    onClose();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Ingesting..." : "Ingest Source"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
