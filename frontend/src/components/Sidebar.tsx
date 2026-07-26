import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  FileText,
  FileCode,
  Globe,
  Youtube,
  Subtitles,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Pin,
  Pencil,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Notebook, Source, SourceType } from "./types";

interface SidebarProps {
  notebooks: Notebook[];
  activeNotebookId: string | null;
  sources: Source[];
  onSelectNotebook: (id: string) => void;
  onCreateNotebook: (name?: string) => void;
  onDeleteNotebook: (id: string) => void;
  onRenameNotebook: (id: string, newName: string) => void;
  onPinNotebook: (id: string, isPinned: boolean) => void;
  onOpenAddSource: () => void;
  onRefreshNotebook: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  notebooks,
  activeNotebookId,
  sources,
  onSelectNotebook,
  onCreateNotebook,
  onDeleteNotebook,
  onRenameNotebook,
  onPinNotebook,
  onOpenAddSource,
  onRefreshNotebook,
}) => {
  const [isSourcesOpen, setIsSourcesOpen] = useState(true);
  const [isNotebooksOpen, setIsNotebooksOpen] = useState(true);

  // Poll indexing sources every 3 seconds
  useEffect(() => {
    if (!activeNotebookId) return;

    const hasIndexingSources = sources.some(
      (s) => s.status !== "READY" && s.status !== "FAILED"
    );

    if (!hasIndexingSources) return;

    const interval = setInterval(() => {
      onRefreshNotebook(activeNotebookId);
    }, 3000);

    return () => clearInterval(interval);
  }, [activeNotebookId, sources, onRefreshNotebook]);

  const handleRenameSource = async (sourceId: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTitle = prompt("Enter new title:", currentTitle);
    if (!newTitle || newTitle.trim() === currentTitle) return;
    try {
      await fetch(`/api/sources/${sourceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() })
      });
      if (activeNotebookId) onRefreshNotebook(activeNotebookId);
    } catch (err) {
      alert("Failed to rename source");
    }
  };

  const handleDeleteSource = async (sourceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this source?")) return;
    try {
      await fetch(`/api/sources/${sourceId}`, { method: "DELETE" });
      if (activeNotebookId) onRefreshNotebook(activeNotebookId);
    } catch (err) {
      alert("Failed to delete source");
    }
  };

  const handleReindexSource = async (sourceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/sources/${sourceId}/reindex`, { method: "POST" });
      if (activeNotebookId) onRefreshNotebook(activeNotebookId);
    } catch (err) {
      alert("Failed to queue re-indexing");
    }
  };

  const getSourceIcon = (type: SourceType) => {
    switch (type) {
      case "PDF":
        return <FileText className="w-4 h-4 text-red-400" />;
      case "TEXT":
        return <FileCode className="w-4 h-4 text-muted-foreground" />;
      case "URL":
        return <Globe className="w-4 h-4 text-blue-400" />;
      case "YOUTUBE":
      case "YOUTUBE_PLAYLIST":
      case "youtube_playlist":
        return <Youtube className="w-4 h-4 text-rose-500" />;
      case "VTT":
        return <Subtitles className="w-4 h-4 text-amber-400" />;
      default:
        return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const renderStatusBadge = (source: Source) => {
    if (source.status === "READY") {
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    }
    if (source.status === "FAILED") {
      return (
        <Tooltip>
          <TooltipTrigger>
            <AlertCircle className="w-3.5 h-3.5 text-destructive" />
          </TooltipTrigger>
          <TooltipContent>{source.statusDetail || "Ingestion failed"}</TooltipContent>
        </Tooltip>
      );
    }
    return (
      <Tooltip>
        <TooltipTrigger>
          <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
        </TooltipTrigger>
        <TooltipContent>{source.status}: {source.statusDetail || "Indexing..."}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <aside className="w-full h-full bg-card border-r border-border flex flex-col select-none shrink-0">
      {/* SOURCES SECTION */}
      <div className={`flex flex-col border-b border-border transition-all ${isSourcesOpen ? "flex-1 min-h-0" : "shrink-0"}`}>
        {/* Header */}
        <div 
          className="px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-accent/50"
          onClick={() => setIsSourcesOpen(!isSourcesOpen)}
        >
          {isSourcesOpen ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          )}
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sources</span>
        </div>

        {isSourcesOpen && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Add Sources button */}
            <div className="px-3 pb-2 shrink-0">
              <Button
                onClick={onOpenAddSource}
                disabled={!activeNotebookId}
                variant="outline"
                className="w-full h-9 text-xs gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add sources
              </Button>
            </div>

            {/* Source list */}
            <ScrollArea className="flex-1">
              <div className="px-3 py-1 space-y-1">
                {sources.length === 0 && (
                  <div className="text-center py-8 px-4 text-xs text-muted-foreground">
                    No sources yet.<br />Click <span className="text-primary font-medium">Add sources</span> to begin.
                  </div>
                )}

                {sources.map((src) => (
                  <div
                    key={src.id}
                    className="group flex items-center gap-2.5 p-2 rounded-lg hover:bg-accent transition-colors"
                  >
                    {getSourceIcon(src.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {src.title || src.originalUri}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {renderStatusBadge(src)}

                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={(e) => handleRenameSource(src.id, src.title || src.originalUri, e)}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={(e) => handleReindexSource(src.id, e)}
                        >
                          <RefreshCw className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 hover:text-destructive"
                          onClick={(e) => handleDeleteSource(src.id, e)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* NOTEBOOKS SECTION */}
      <div className={`flex flex-col transition-all ${isNotebooksOpen ? "flex-1 min-h-0" : "shrink-0"}`}>
        <div 
          className="px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-accent/50"
          onClick={() => setIsNotebooksOpen(!isNotebooksOpen)}
        >
          {isNotebooksOpen ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          )}
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notebooks</span>
        </div>
        
        {isNotebooksOpen && (
          <ScrollArea className="flex-1">
            <div className="px-3 py-1 space-y-0.5">
              {notebooks.map((nb) => (
                <div
                  key={nb.id}
                  className={`group flex items-center justify-between w-full px-2 py-1 rounded transition ${
                    nb.id === activeNotebookId
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <button
                    onClick={() => onSelectNotebook(nb.id)}
                    className="flex-1 text-left text-xs font-medium truncate"
                    title={nb.name}
                  >
                    {nb.name}
                  </button>
                  <div className={`flex items-center gap-0.5 ml-2 transition-opacity shrink-0 ${nb.isPinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-5 w-5 p-0 ${nb.isPinned ? "text-primary" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPinNotebook(nb.id, !nb.isPinned);
                      }}
                      title={nb.isPinned ? "Unpin notebook" : "Pin notebook"}
                    >
                      <Pin className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        const newName = prompt("Enter new notebook name:", nb.name);
                        if (newName && newName.trim() !== nb.name) {
                          onRenameNotebook(nb.id, newName.trim());
                        }
                      }}
                      title="Rename notebook"
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNotebook(nb.id);
                      }}
                      title="Delete notebook"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </aside>
  );
};
