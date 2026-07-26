import React, { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { StudioFeatureCard } from "./StudioFeatureCard";
import { FlashcardStudioView } from "./FlashcardStudioView";
import { QuizStudioView } from "./QuizStudioView";
import { MindMapStudioView } from "./MindMapStudioView";
import { RoadmapStudioView } from "./RoadmapStudioView";
import {
  Layers,
  BrainCircuit,
  FileQuestion,
  Network,
  Route,
  Mic,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import type { Source } from "../types";

interface StudioPanelProps {
  notebookId: string;
  notebookName: string;
  sources: Source[];
}

type StudioView = "grid" | "flashcards" | "quiz" | "mindmap" | "roadmap";

export const StudioPanel: React.FC<StudioPanelProps> = ({
  notebookId,
  notebookName,
  sources,
}) => {
  const [activeView, setActiveView] = useState<StudioView>("grid");
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  const readySources = sources.filter((s) => s.status === "READY");
  const hasReadySources = readySources.length > 0;
  const readySourceIds = readySources.map((s) => s.id);
  const playlistSource = readySources.find(
    (s) => s.type === "youtube_playlist" || s.type === "YOUTUBE_PLAYLIST"
  );

  const handleGenerate = async (viewType: StudioView) => {
    if (generating[viewType] || completed[viewType]) {
      if (completed[viewType]) {
        setActiveView(viewType);
      }
      return;
    }
    
    setGenerating((prev) => ({ ...prev, [viewType]: true }));
    
    try {
      const payload: any = { sourceIds: readySourceIds, regenerate: false };
      if (viewType === "flashcards" || viewType === "quiz") {
        payload.count = 15;
      }
      const res = await fetch(`/api/notebooks/${notebookId}/${viewType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (res.ok) {
        setCompleted((prev) => ({ ...prev, [viewType]: true }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating((prev) => ({ ...prev, [viewType]: false }));
    }
  };

  if (activeView === "flashcards") {
    return (
      <FlashcardStudioView
        notebookId={notebookId}
        sourceIds={readySourceIds}
        notebookName={notebookName}
        onBackToStudio={() => setActiveView("grid")}
      />
    );
  }

  if (activeView === "quiz") {
    return (
      <QuizStudioView
        notebookId={notebookId}
        sourceIds={readySourceIds}
        notebookName={notebookName}
        onBackToStudio={() => setActiveView("grid")}
      />
    );
  }

  if (activeView === "mindmap") {
    return (
      <MindMapStudioView
        notebookId={notebookId}
        sourceIds={readySourceIds}
        notebookName={notebookName}
        onBackToStudio={() => setActiveView("grid")}
      />
    );
  }

  if (activeView === "roadmap" && playlistSource) {
    return (
      <RoadmapStudioView
        notebookId={notebookId}
        playlistSource={playlistSource}
        onBackToStudio={() => setActiveView("grid")}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Studio</h2>
        </div>
      </div>

      {/* Feature Grid */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <p className="text-xs text-muted-foreground mb-3">
            Generate study materials from your sources
          </p>

          <div className="grid grid-cols-2 gap-2">
            {/* Flashcards */}
            <StudioFeatureCard
              icon={<BrainCircuit className="w-5 h-5" />}
              label="Flashcards"
              onClick={() => handleGenerate("flashcards")}
              disabled={!hasReadySources}
              disabledReason="Select at least one source"
              colorClass="text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/30"
            />

            {/* Quiz */}
            <StudioFeatureCard
              icon={<FileQuestion className="w-5 h-5" />}
              label="Quiz"
              onClick={() => handleGenerate("quiz")}
              disabled={!hasReadySources}
              disabledReason="Select at least one source"
              colorClass="text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30"
            />

            {/* Mind Map */}
            <StudioFeatureCard
              icon={<Network className="w-5 h-5" />}
              label="Mind Map"
              onClick={() => handleGenerate("mindmap")}
              disabled={!hasReadySources}
              disabledReason="Select at least one source"
              colorClass="text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30"
            />

            {/* Roadmap */}
            <StudioFeatureCard
              icon={<Route className="w-5 h-5" />}
              label="Roadmap"
              onClick={() => handleGenerate("roadmap")}
              disabled={!playlistSource}
              disabledReason="Add a YouTube playlist source"
              colorClass="text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/30"
            />

            {/* Podcast (Coming Soon) */}
            <StudioFeatureCard
              icon={<Mic className="w-5 h-5" />}
              label="Podcast"
              badge="Coming Soon"
              disabled={true}
              disabledReason="This feature is currently in development"
              colorClass="text-pink-400 hover:bg-pink-500/10 hover:border-pink-500/30"
            />
          </div>

          {/* Generated Artifacts Queue */}
          {["flashcards", "quiz", "mindmap", "roadmap"].some(t => generating[t] || completed[t]) && (
            <div className="mt-4 space-y-2">
              {["flashcards", "quiz", "mindmap", "roadmap"]
                .filter(t => generating[t] || completed[t])
                .map(t => {
                  const isComplete = completed[t];
                  const label = t === "mindmap" ? "Mind Map" : t.charAt(0).toUpperCase() + t.slice(1);
                  return (
                    <div 
                      key={t}
                      onClick={() => isComplete ? setActiveView(t as StudioView) : undefined}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        isComplete ? 'cursor-pointer bg-card hover:bg-accent border-border' : 'border-transparent bg-muted/30'
                      }`}
                    >
                      {isComplete ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">
                          {isComplete ? `${label} - Completed` : `Generating ${label.toLowerCase()}...`}
                        </p>
                        {!isComplete && (
                          <p className="text-[10px] text-muted-foreground">
                            based on {readySources.length} source{readySources.length !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {!hasReadySources && sources.length > 0 && (
            <>
              <Separator className="my-4" />
              <p className="text-xs text-muted-foreground text-center">
                Waiting for sources to finish indexing…
              </p>
            </>
          )}

          {sources.length === 0 && (
            <>
              <Separator className="my-4" />
              <p className="text-xs text-muted-foreground text-center">
                Add a source to get started
              </p>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
