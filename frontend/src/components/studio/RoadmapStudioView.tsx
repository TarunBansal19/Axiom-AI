import React, { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, CheckCircle2, Circle, ChevronDown, ChevronRight, PlayCircle } from "lucide-react";
import { Roadmap, RoadmapStage, Source } from "../types";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbSeparator, BreadcrumbLink } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";

interface RoadmapStudioViewProps {
  notebookId: string;
  onBackToStudio: () => void;
  playlistSource: Source;
}

export function RoadmapStudioView({ notebookId, onBackToStudio, playlistSource }: RoadmapStudioViewProps) {
  const [viewState, setViewState] = useState<"initial" | "loading" | "ready" | "error">("initial");
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});

  const fetchRoadmap = useCallback(async (regenerate = false) => {
    if (!notebookId || !playlistSource) return;
    setViewState("loading");
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/roadmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: playlistSource.id, regenerate }),
      });

      if (!res.ok) {
        let errText = "Failed to generate roadmap";
        try {
          const clone = res.clone();
          const data = await clone.json();
          errText = data.error || errText;
        } catch {
          const text = await res.text();
          if (text) errText = text;
        }
        throw new Error(errText);
      }

      const data = await res.json();
      setRoadmap(data.roadmap);
      
      // Auto-expand the first stage
      if (data.roadmap.stages && data.roadmap.stages.length > 0) {
        setExpandedStages({ [data.roadmap.stages[0].id]: true });
      }
      
      setViewState("ready");
    } catch (err: any) {
      setErrorMsg(err.message || "An unknown error occurred.");
      setViewState("error");
    }
  }, [notebookId, playlistSource]);

  useEffect(() => {
    fetchRoadmap();
  }, [fetchRoadmap]);

  const toggleStageCompletion = async (stage: RoadmapStage) => {
    if (!notebookId || !roadmap) return;
    const newCompleted = !stage.completed;

    // Optimistic update
    setRoadmap({
      ...roadmap,
      stages: roadmap.stages.map(s => s.id === stage.id ? { ...s, completed: newCompleted } : s)
    });

    try {
      await fetch(`/api/notebooks/${notebookId}/roadmap/${roadmap.id}/stages/${stage.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: newCompleted }),
      });
    } catch (err) {
      // Revert if failed
      setRoadmap({
        ...roadmap,
        stages: roadmap.stages.map(s => s.id === stage.id ? { ...s, completed: stage.completed } : s)
      });
    }
  };

  const toggleStageExpand = (stageId: string) => {
    setExpandedStages(prev => ({
      ...prev,
      [stageId]: !prev[stageId]
    }));
  };

  if (!playlistSource) return null;

  const totalStages = roadmap?.stages.length || 0;
  const completedStages = roadmap?.stages.filter(s => s.completed).length || 0;
  const progressPercent = totalStages > 0 ? (completedStages / totalStages) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b shrink-0">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink onClick={onBackToStudio} className="text-muted-foreground hover:text-foreground cursor-pointer">
                  Studio
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink className="text-foreground font-medium">Roadmap</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center space-x-2">
          {viewState === "ready" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchRoadmap(true)}
              disabled={viewState !== "ready"}
              className="h-8 text-xs font-normal"
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Regenerate
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-10 relative">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold mb-2">{roadmap?.title || "Learning Roadmap"}</h1>
            <p className="text-muted-foreground text-sm">
              Generated from "{playlistSource.title}"
            </p>
            
            {viewState === "ready" && (
              <div className="mt-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium">{completedStages} of {totalStages} stages complete</span>
                  <span className="text-muted-foreground">{Math.round(progressPercent)}%</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all duration-500 ease-in-out" 
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {viewState === "loading" && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Analyzing playlist and designing your roadmap...</p>
              <p className="text-sm mt-2 opacity-70">This might take a moment.</p>
            </div>
          )}

          {viewState === "error" && (
            <div className="text-center py-20 text-destructive">
              <p>{errorMsg}</p>
              <Button onClick={() => fetchRoadmap()} variant="outline" className="mt-4">
                Try Again
              </Button>
            </div>
          )}

          {viewState === "ready" && roadmap && (
            <div className="relative mt-8">
              {/* Vertical timeline line */}
              <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-border rounded-full" />
              
              <div className="space-y-6">
                {roadmap.stages.map((stage, idx) => {
                  const isExpanded = expandedStages[stage.id];
                  const isCompleted = stage.completed;
                  
                  return (
                    <div key={stage.id} className="relative flex items-start group">
                      {/* Timeline marker */}
                      <div className="absolute left-6 w-0.5 h-full bg-border -z-10 top-8" />
                      
                      <button 
                        className={`relative z-10 shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                          isCompleted ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        }`}
                        onClick={() => toggleStageCompletion(stage)}
                        title={isCompleted ? "Mark incomplete" : "Mark complete"}
                      >
                        {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                      </button>
                      
                      <div className="ml-6 flex-1 bg-card border rounded-xl overflow-hidden transition-all shadow-sm">
                        <div 
                          className="p-5 cursor-pointer flex justify-between items-start hover:bg-accent/50 transition-colors"
                          onClick={() => toggleStageExpand(stage.id)}
                        >
                          <div>
                            <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">
                              Stage {idx + 1} • {stage.estimatedMinutes} mins
                            </div>
                            <h3 className={`text-lg font-medium ${isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                              {stage.title}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                              {stage.description}
                            </p>
                          </div>
                          <div className="shrink-0 text-muted-foreground p-2">
                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div className="p-5 pt-0 border-t bg-card/50">
                            {stage.outcomes.length > 0 && (
                              <div className="mb-6 mt-4">
                                <h4 className="text-sm font-semibold mb-2">You will be able to:</h4>
                                <ul className="space-y-1">
                                  {stage.outcomes.map((outcome, oIdx) => (
                                    <li key={oIdx} className="text-sm text-muted-foreground flex items-start">
                                      <span className="mr-2 text-primary/70">•</span> {outcome}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            <div>
                              <h4 className="text-sm font-semibold mb-3">Videos in this stage:</h4>
                              <div className="flex overflow-x-auto pb-4 gap-3 snap-x">
                                {stage.videoIds.map((videoId, vIdx) => {
                                  // Find the video from the source raw text
                                  let videoTitle = `Video ${videoId}`;
                                  try {
                                    const sourceData = JSON.parse(playlistSource.rawContentText || "{}");
                                    const v = sourceData.videos?.find((vid: any) => vid.videoId === videoId);
                                    if (v) videoTitle = v.title;
                                  } catch (e) {}
                                  
                                  return (
                                    <a
                                      key={vIdx}
                                      href={`https://www.youtube.com/watch?v=${videoId}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="snap-start shrink-0 w-64 border bg-background rounded-lg overflow-hidden group/video hover:border-primary/50 transition-colors"
                                    >
                                      <div className="relative w-full aspect-video bg-muted flex items-center justify-center overflow-hidden">
                                        <img 
                                          src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`} 
                                          alt={videoTitle}
                                          className="object-cover w-full h-full opacity-80 group-hover/video:opacity-100 transition-opacity"
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <PlayCircle className="w-10 h-10 text-white drop-shadow-md opacity-70 group-hover/video:opacity-100 group-hover/video:scale-110 transition-all" />
                                        </div>
                                      </div>
                                      <div className="p-3 text-sm font-medium line-clamp-2 leading-tight">
                                        {videoTitle}
                                      </div>
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
